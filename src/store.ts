import type {
  CachedRow,
  Config,
  RowDefinition,
  Snapshot,
  Video,
} from "./types";

export const SNAPSHOT_KEY = "tv.snapshot.v1";
export const API_KEY = "tv.youtube-key";
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
    if (row.type === "search" && text(row.query))
      return {
        id: row.id,
        label: row.label,
        type: "search",
        query: row.query.trim(),
      };
    if (
      row.type === "channel" &&
      typeof row.channelId === "string" &&
      /^UC[a-zA-Z0-9_-]{22}$/.test(row.channelId)
    )
      return {
        id: row.id,
        label: row.label,
        type: "channel",
        channelId: row.channelId,
      };
    throw new Error("Check the search query or channel ID.");
  });
  return { version: 1, rows };
}

export const definitionKey = (row: RowDefinition): string =>
  row.type === "search" ? `search:${row.query}` : `channel:${row.channelId}`;
export const isVideo = (v: unknown): v is Video =>
  object(v) &&
  typeof v.id === "string" &&
  /^[a-zA-Z0-9_-]{11}$/.test(v.id) &&
  typeof v.title === "string" &&
  typeof v.channelTitle === "string" &&
  typeof v.thumbnail === "string" &&
  /^https:\/\/(i\.ytimg\.com|img\.youtube\.com)\//.test(v.thumbnail) &&
  typeof v.publishedAt === "string" &&
  Number.isFinite(Date.parse(v.publishedAt));

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
    let search: Snapshot["search"];
    if (object(raw.search) && text(raw.search.query)) {
      search = {
        query: raw.search.query,
        result: readRow(raw.search.result, `search:${raw.search.query}`, now),
      };
    }
    return { version: 1, config, rows, ...(search ? { search } : {}) };
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
    getKey() {
      try {
        return storage.getItem(API_KEY) || "";
      } catch {
        return "";
      }
    },
    setKey(key: string) {
      if (!key.trim()) throw new Error("Enter your API key.");
      try {
        storage.setItem(API_KEY, key.trim());
      } catch {
        throw new Error(
          "Cannot save your API key. Check Chrome storage settings.",
        );
      }
    },
    prune(now = Date.now()) {
      const rows = Object.fromEntries(
        Object.entries(snapshot.rows).filter(
          ([, row]) => now - row.updatedAt < RETENTION_MS,
        ),
      );
      const search =
        snapshot.search?.result &&
        now - snapshot.search.result.updatedAt >= RETENTION_MS
          ? { query: snapshot.search.query }
          : snapshot.search;
      if (
        Object.keys(rows).length !== Object.keys(snapshot.rows).length ||
        search !== snapshot.search
      )
        this.save({ ...snapshot, rows, search });
    },
  };
}
export type TVStore = ReturnType<typeof createStore>;
