import type {
  CachedRow,
  Config,
  RowDefinition,
  Snapshot,
  SearchOptions,
  SettingsData,
  Video,
} from "./types";
import { DEFAULT_MIN_DURATION_SECONDS, DEFAULT_SEARCH_OPTIONS } from "./types";

export const SNAPSHOT_KEY = "tv.snapshot.v1";
export const RETENTION_MS = 29 * 24 * 60 * 60 * 1000;
export const emptySnapshot = (): Snapshot => ({
  version: 1,
  config: { version: 1, rows: [] },
  rows: {},
});
const safeId = (id: unknown): id is string =>
  typeof id === "string" &&
  /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(id) &&
  !["constructor", "prototype", "__proto__", "search"].includes(id);
const text = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= 500;
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function parseSearchOptions(options: unknown): SearchOptions {
  if (
    !object(options) ||
    !text(options.query) ||
    typeof options.order !== "string" ||
    !["relevance", "viewCount", "rating", "date"].includes(options.order) ||
    typeof options.timeRange !== "string" ||
    !["24h", "7d", "30d", "all"].includes(options.timeRange) ||
    !Number.isInteger(options.maxResults) ||
    (options.maxResults as number) < 1 ||
    (options.maxResults as number) > 50 ||
    (options.minDurationSeconds !== undefined &&
      (!Number.isSafeInteger(options.minDurationSeconds) ||
        (options.minDurationSeconds as number) < 0)) ||
    (options.relevanceLanguage !== undefined &&
      (typeof options.relevanceLanguage !== "string" ||
        !/^[a-zA-Z]{2,3}(?:-[a-zA-Z]{2,4})?$/.test(
          options.relevanceLanguage.trim(),
        ))) ||
    (options.regionCode !== undefined &&
      (typeof options.regionCode !== "string" ||
        !/^[a-zA-Z]{2}$/.test(options.regionCode.trim())))
  )
    throw new Error(
      "Check the search options: query, order, time range, language, region, page size and minimum duration.",
    );
  return {
    query: options.query.trim(),
    order: options.order as SearchOptions["order"],
    timeRange: options.timeRange as SearchOptions["timeRange"],
    maxResults: options.maxResults as number,
    ...(options.minDurationSeconds !== undefined
      ? { minDurationSeconds: options.minDurationSeconds as number }
      : {}),
    ...(typeof options.relevanceLanguage === "string"
      ? { relevanceLanguage: options.relevanceLanguage.trim().toLowerCase() }
      : {}),
    ...(typeof options.regionCode === "string"
      ? { regionCode: options.regionCode.trim().toUpperCase() }
      : {}),
  };
}

export function parseConfig(value: unknown): Config {
  if (
    !object(value) ||
    value.version !== 1 ||
    !Array.isArray(value.rows) ||
    value.rows.length > 50
  )
    throw new Error("Check the format of config.json.");
  const ids = new Set<string>();
  const rows = value.rows.map((row): RowDefinition => {
    if (!object(row) || !safeId(row.id) || ids.has(row.id) || !text(row.label))
      throw new Error("Each row needs a unique ID and a label.");
    ids.add(row.id);
    if (row.type === "search") {
      const options =
        row.search === undefined && text(row.query)
          ? {
              query: row.query,
              order: "relevance",
              timeRange: "all",
              maxResults: 25,
            }
          : row.search;
      const search = parseSearchOptions(options);
      return { id: row.id, label: row.label, type: "search", search };
    }
    if (
      row.type === "channel" &&
      typeof row.channelId === "string" &&
      (/^UC[a-zA-Z0-9_-]{22}$/.test(row.channelId.trim()) ||
        /^@[a-zA-Z0-9._-]{3,30}$/.test(row.channelId.trim()))
    )
      return {
        id: row.id,
        label: row.label,
        type: "channel",
        channelId: row.channelId.trim(),
      };
    throw new Error("Check the search query or channel ID.");
  });
  let searchDefaults;
  if (value.searchDefaults !== undefined) {
    if (!object(value.searchDefaults))
      throw new Error("Check the search defaults.");
    const { query: _, ...defaults } = parseSearchOptions({
      ...value.searchDefaults,
      query: "defaults",
    });
    searchDefaults = { ...DEFAULT_SEARCH_OPTIONS, ...defaults };
  }
  return { version: 1, rows, ...(searchDefaults ? { searchDefaults } : {}) };
}

export function parseSettings(value: unknown): SettingsData {
  const config = parseConfig(value);
  if (!object(value) || !text(value.apiKey))
    throw new Error("Enter your API key.");
  if (!config.searchDefaults)
    throw new Error("The settings JSON must include searchDefaults.");
  return {
    ...config,
    apiKey: value.apiKey.trim(),
    searchDefaults: config.searchDefaults,
  };
}

export const definitionKey = (row: RowDefinition): string =>
  row.type === "search"
    ? `search:${JSON.stringify([row.search.query, row.search.order, row.search.timeRange, row.search.relevanceLanguage ?? null, row.search.regionCode ?? null, row.search.maxResults, row.search.minDurationSeconds ?? DEFAULT_MIN_DURATION_SECONDS])}`
    : `channel:${row.channelId}:min-duration:${DEFAULT_MIN_DURATION_SECONDS}`;
export const isVideo = (v: unknown): v is Video =>
  object(v) &&
  typeof v.id === "string" &&
  /^[a-zA-Z0-9_-]{11}$/.test(v.id) &&
  typeof v.title === "string" &&
  typeof v.channelTitle === "string" &&
  typeof v.thumbnail === "string" &&
  /^https:\/\/(i\.ytimg\.com|img\.youtube\.com)\//.test(v.thumbnail) &&
  typeof v.publishedAt === "string" &&
  Number.isFinite(Date.parse(v.publishedAt)) &&
  (v.viewCount == null ||
    (typeof v.viewCount === "number" &&
      Number.isSafeInteger(v.viewCount) &&
      v.viewCount >= 0));

function readRow(
  value: unknown,
  key: string,
  now: number,
): CachedRow | undefined {
  if (
    !object(value) ||
    value.definitionKey !== key ||
    !Array.isArray(value.videos) ||
    !value.videos.every(isVideo) ||
    typeof value.updatedAt !== "number" ||
    !Number.isFinite(value.updatedAt) ||
    value.updatedAt > now + 60_000 ||
    now - value.updatedAt >= RETENTION_MS
  )
    return;
  return {
    definitionKey: key,
    videos: value.videos,
    updatedAt: value.updatedAt,
    ...(typeof value.publishedAfter === "string" &&
    Number.isFinite(Date.parse(value.publishedAfter))
      ? { publishedAfter: value.publishedAfter }
      : {}),
    ...(typeof value.nextPageToken === "string"
      ? { nextPageToken: value.nextPageToken }
      : {}),
  };
}

export function readSnapshot(
  storage: Pick<Storage, "getItem">,
  now = Date.now(),
): Snapshot {
  try {
    const raw: unknown = JSON.parse(storage.getItem(SNAPSHOT_KEY) || "null");
    if (!object(raw) || raw.version !== 1) return emptySnapshot();
    const config = parseConfig(raw.config);
    const rows: Record<string, CachedRow> = {};
    if (object(raw.rows))
      for (const row of config.rows) {
        const cached = readRow(raw.rows[row.id], definitionKey(row), now);
        if (cached) rows[row.id] = cached;
      }
    // Discard legacy ad-hoc searches; only config-defined rows belong in the cache.
    return {
      version: 1,
      config,
      rows,
      ...(typeof raw.apiKey === "string" ? { apiKey: raw.apiKey } : {}),
      ...(raw.localConfig === true ? { localConfig: true } : {}),
    };
  } catch {
    return emptySnapshot();
  }
}

export function createStore(storage: Storage) {
  let snapshot = readSnapshot(storage);
  // Remove expired metadata from disk too, including after a long offline absence.
  try {
    const stored = storage.getItem(SNAPSHOT_KEY);
    const raw = JSON.parse(stored || "null");
    if (raw?.version === 1) {
      parseConfig(raw.config);
      const clean = JSON.stringify(snapshot);
      if (clean !== stored) storage.setItem(SNAPSHOT_KEY, clean);
    }
  } catch {
    /* Later writes report unavailable storage without destroying the last saved copy. */
  }
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    save(next: Snapshot) {
      // Persist before notifying React: unsuccessful writes never replace the displayed snapshot.
      try {
        storage.setItem(SNAPSHOT_KEY, JSON.stringify(next));
      } catch {
        throw new Error(
          "Cannot save on this device. Check Chrome storage settings and available space.",
        );
      }
      snapshot = next;
      listeners.forEach((listener) => listener());
    },
    getKey: () => snapshot.apiKey || "",
    getSettings: (): SettingsData => ({
      ...snapshot.config,
      searchDefaults: {
        ...(snapshot.config.searchDefaults ?? DEFAULT_SEARCH_OPTIONS),
      },
      apiKey: snapshot.apiKey || "",
    }),
    setKey(key: string) {
      if (!text(key)) throw new Error("Enter your API key.");
      this.save({ ...snapshot, apiKey: key.trim() });
    },
    saveSettings(value: unknown) {
      const { apiKey, ...config } = parseSettings(value);
      const rows: Snapshot["rows"] = {};
      for (const row of config.rows) {
        const cached = snapshot.rows[row.id];
        if (cached?.definitionKey === definitionKey(row)) rows[row.id] = cached;
      }
      // One write commits the key, defaults, list and ownership together.
      this.save({ version: 1, apiKey, localConfig: true, config, rows });
    },
    prune(now = Date.now()) {
      const rows = Object.fromEntries(
        Object.entries(snapshot.rows).filter(
          ([, row]) => now - row.updatedAt < RETENTION_MS,
        ),
      );
      if (Object.keys(rows).length !== Object.keys(snapshot.rows).length)
        this.save({ ...snapshot, rows });
    },
  };
}
export type TVStore = ReturnType<typeof createStore>;
