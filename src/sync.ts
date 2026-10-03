import { definitionKey, parseConfig, type TVStore } from "./store";
import type { CachedRow, RowDefinition, Snapshot } from "./types";
import { newest, YouTubeClient, YouTubeError } from "./youtube";

export const CONFIG_INTERVAL = 60_000;
export const VIDEO_INTERVAL = 10 * 60_000;
export const CONFIG_URL =
  "https://raw.githubusercontent.com/yusukeshib/tv/main/public/config.json";
const BACKOFF_KEY = "tv.backoff.v1";
const SEARCH_ID = "search";
export interface SyncStatus {
  loadingRows: readonly string[];
  notice?: string;
}

export function nextQuotaReset(now: number): number {
  const format = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = format.format(now);
  let low = now,
    high = now + 26 * 60 * 60_000;
  while (high - low > 1000) {
    const middle = Math.floor((low + high) / 2);
    if (format.format(middle) === today) low = middle;
    else high = middle;
  }
  return high + 1000;
}

export class SyncController {
  private client: YouTubeClient;
  private status: SyncStatus = { loadingRows: [] };
  private listeners = new Set<() => void>();
  private requests = new Map<string, AbortController>();
  private errors = new Map<string, string>();
  private configRequest?: AbortController;
  private interval?: ReturnType<typeof setInterval>;
  private stopped = true;
  private ticking = false;
  private authBlocked = false;
  private backoff: Partial<Record<RowDefinition["type"], number>> = {};

  constructor(
    private store: TVStore,
    private storage: Storage,
    private request: typeof fetch = (input, init) => fetch(input, init),
    private configUrl = CONFIG_URL,
  ) {
    this.client = new YouTubeClient(store.getKey, request);
    try {
      const raw = JSON.parse(storage.getItem(BACKOFF_KEY) || "{}");
      for (const type of ["search", "channel"] as const)
        if (typeof raw?.[type] === "number" && Number.isFinite(raw[type]))
          this.backoff[type] = raw[type];
    } catch {
      /* An invalid optional backoff record is safe to discard. */
    }
  }
  getStatus = () => this.status;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish() {
    this.status = {
      loadingRows: [...this.requests.keys()],
      notice: this.errors.values().next().value,
    };
    this.listeners.forEach((listener) => listener());
  }
  private report(id: string, error: unknown) {
    this.errors.set(
      id,
      error instanceof Error
        ? error.message
        : "Couldn’t update. Your saved list is unchanged.",
    );
    this.publish();
  }
  start() {
    if (!this.stopped) return;
    this.stopped = false;
    document.addEventListener("visibilitychange", this.onVisibility);
    window.addEventListener("online", this.onOnline);
    this.interval = setInterval(() => {
      if (!document.hidden) void this.tick();
    }, CONFIG_INTERVAL);
    if (!document.hidden) void this.tick();
  }
  stop() {
    this.stopped = true;
    clearInterval(this.interval);
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("online", this.onOnline);
    this.abort();
  }
  private abort() {
    this.configRequest?.abort();
    for (const request of this.requests.values()) request.abort();
  }
  private onVisibility = () => {
    if (document.hidden) this.abort();
    else void this.tick();
  };
  private onOnline = () => {
    if (!document.hidden) void this.tick();
  };
  private currentDefinition(id: string): RowDefinition | undefined {
    const snapshot = this.store.getSnapshot();
    if (id === SEARCH_ID)
      return snapshot.search
        ? {
            id,
            type: "search",
            label: snapshot.search.query,
            query: snapshot.search.query,
          }
        : undefined;
    return snapshot.config.rows.find((row) => row.id === id);
  }
  private cached(id: string): CachedRow | undefined {
    const snapshot = this.store.getSnapshot();
    return id === SEARCH_ID ? snapshot.search?.result : snapshot.rows[id];
  }
  private saveResult(id: string, result: CachedRow) {
    const snapshot = this.store.getSnapshot();
    this.store.save(
      id === SEARCH_ID
        ? {
            ...snapshot,
            search: snapshot.search
              ? { ...snapshot.search, result }
              : undefined,
          }
        : { ...snapshot, rows: { ...snapshot.rows, [id]: result } },
    );
  }
  resetKey() {
    this.abort();
    this.authBlocked = false;
    this.backoff = {};
    try {
      this.storage.removeItem(BACKOFF_KEY);
    } catch {
      /* The key setter reports storage failure. */
    }
    this.errors.clear();
    this.publish();
  }

  async tick() {
    if (this.stopped || this.ticking || document.hidden) return;
    this.ticking = true;
    try {
      this.store.prune();
      await this.refreshConfig();
      if (this.stopped || document.hidden) return;
      const snapshot = this.store.getSnapshot();
      const definitions = [...snapshot.config.rows];
      const search = this.currentDefinition(SEARCH_ID);
      if (search) definitions.unshift(search);
      for (const row of definitions) {
        if (this.stopped || document.hidden) return;
        const cached = this.cached(row.id);
        if (
          !cached ||
          cached.definitionKey !== definitionKey(row) ||
          Date.now() - cached.updatedAt >= VIDEO_INTERVAL
        )
          await this.refreshRow(row);
      }
    } catch (error) {
      this.report("storage", error);
    } finally {
      this.ticking = false;
    }
  }
  private async refreshConfig() {
    const controller = new AbortController();
    this.configRequest = controller;
    try {
      const response = await this.request(this.configUrl, {
        cache: "no-store",
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(15_000),
        ]),
      });
      if (!response.ok)
        throw new Error(
          "Couldn’t fetch config.json. Keeping your saved setup.",
        );
      const config = parseConfig(await response.json());
      if (controller.signal.aborted || this.stopped) return;
      const previous = this.store.getSnapshot();
      if (JSON.stringify(config) !== JSON.stringify(previous.config)) {
        const rows: Snapshot["rows"] = {};
        for (const row of config.rows) {
          const cached = previous.rows[row.id];
          if (cached?.definitionKey === definitionKey(row))
            rows[row.id] = cached;
        }
        // Abort removed/redefined rows before accepting this generation of config.
        for (const old of previous.config.rows) {
          const replacement = config.rows.find((row) => row.id === old.id);
          if (
            !replacement ||
            definitionKey(replacement) !== definitionKey(old)
          ) {
            this.requests.get(old.id)?.abort();
            this.errors.delete(old.id);
          }
        }
        this.store.save({ ...previous, config, rows });
      }
      this.errors.delete("config");
    } catch (error) {
      if (!controller.signal.aborted)
        this.report(
          "config",
          error instanceof TypeError
            ? new Error("You’re offline. Keeping your saved setup.")
            : error,
        );
    } finally {
      if (this.configRequest === controller) this.configRequest = undefined;
      this.publish();
    }
  }

  private async refreshRow(row: RowDefinition, more = false) {
    if (this.stopped || this.requests.has(row.id) || this.authBlocked) return;
    const current = this.currentDefinition(row.id);
    if (!current || definitionKey(current) !== definitionKey(row)) return;
    const until = this.backoff[row.type] || 0;
    if (until > Date.now()) {
      this.errors.set(
        row.id,
        "YouTube requests are paused until the quota or rate limit resets. Showing saved videos.",
      );
      this.publish();
      return;
    }
    const existing = this.cached(row.id);
    if (more && !existing?.nextPageToken) return;
    const controller = new AbortController();
    this.requests.set(row.id, controller);
    this.publish();
    try {
      const signal = AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(20_000),
      ]);
      const page = await this.client.page(
        row,
        signal,
        more ? existing?.nextPageToken : undefined,
      );
      const latest = this.currentDefinition(row.id);
      if (
        controller.signal.aborted ||
        this.stopped ||
        !latest ||
        definitionKey(latest) !== definitionKey(row)
      )
        return;
      if (more && this.cached(row.id) !== existing) return;
      this.saveResult(row.id, {
        definitionKey: definitionKey(row),
        videos: newest(
          more ? [...(existing?.videos || []), ...page.videos] : page.videos,
        ),
        nextPageToken: page.nextPageToken,
        updatedAt: more ? existing!.updatedAt : Date.now(),
      });
      this.errors.delete(row.id);
      this.errors.delete("storage");
    } catch (error) {
      if (!controller.signal.aborted) {
        if (error instanceof YouTubeError) {
          if (error.kind === "auth") this.authBlocked = true;
          if (error.kind === "quota" || error.kind === "rate") {
            this.backoff[row.type] =
              error.kind === "quota"
                ? nextQuotaReset(Date.now())
                : Date.now() + error.retryAfter;
            try {
              this.storage.setItem(BACKOFF_KEY, JSON.stringify(this.backoff));
            } catch {
              /* In-memory backoff still applies. */
            }
          }
        }
        this.report(row.id, error);
      }
    } finally {
      if (this.requests.get(row.id) === controller)
        this.requests.delete(row.id);
      this.publish();
    }
  }

  async search(query: string) {
    query = query.trim().slice(0, 500);
    this.requests.get(SEARCH_ID)?.abort();
    this.requests.delete(SEARCH_ID);
    this.errors.delete(SEARCH_ID);
    try {
      const snapshot = this.store.getSnapshot();
      if (!query) {
        this.store.save({ ...snapshot, search: undefined });
        this.publish();
        return;
      }
      this.store.save({
        ...snapshot,
        search: snapshot.search?.query === query ? snapshot.search : { query },
      });
      const row = this.currentDefinition(SEARCH_ID)!;
      await this.refreshRow(row);
    } catch (error) {
      this.report("storage", error);
    }
  }
  async loadMore(id: string) {
    const row = this.currentDefinition(id);
    if (row) await this.refreshRow(row, true);
  }
}
