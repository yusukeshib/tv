import { describe, expect, it, vi } from "vitest";
import {
  createStore,
  definitionKey,
  emptySnapshot,
  parseConfig,
  parseSettings,
  readSnapshot,
  RETENTION_MS,
  SNAPSHOT_KEY,
} from "../src/store";
import { cached, memoryStorage, row, snapshot } from "./fixtures";
import { DEFAULT_SEARCH_OPTIONS } from "../src/types";

describe("snapshot storage", () => {
  it("normalizes options and makes every retrieval setting part of the cache key", () => {
    const config = (search: unknown) =>
      parseConfig({ version: 1, rows: [{ ...row, search }] }).rows[0];
    expect(
      config({ ...row.search, relevanceLanguage: " EN ", regionCode: " us " }),
    ).toEqual({
      ...row,
      search: { ...row.search, relevanceLanguage: "en", regionCode: "US" },
    });
    for (const change of [
      { query: "other" },
      { order: "rating" },
      { timeRange: "7d" },
      { relevanceLanguage: "en" },
      { regionCode: "US" },
      { maxResults: 50 },
      { minDurationSeconds: 600 },
    ]) {
      expect(definitionKey(config({ ...row.search, ...change }))).not.toBe(
        definitionKey(row),
      );
    }
    expect(definitionKey({ ...row, label: "Renamed", id: "other" })).toBe(
      definitionKey(row),
    );
    for (const change of [
      { order: "bad" },
      { timeRange: "week" },
      { maxResults: 51 },
      { maxResults: 0 },
      { maxResults: 1.5 },
      { minDurationSeconds: Number.POSITIVE_INFINITY },
      { minDurationSeconds: -1 },
      { minDurationSeconds: 240.5 },
      { minDurationSeconds: "240" },
      { regionCode: "USA" },
      { relevanceLanguage: "" },
    ]) {
      expect(() => config({ ...row.search, ...change })).toThrow();
    }
    const legacy = {
      id: row.id,
      label: row.label,
      type: "search",
      query: " news ",
    };
    expect(parseConfig({ version: 1, rows: [legacy] }).rows).toEqual([row]);
    const storage = memoryStorage({
      [SNAPSHOT_KEY]: JSON.stringify({
        ...snapshot(cached(Date.now(), { definitionKey: "search:news" })),
        config: { version: 1, rows: [legacy] },
        search: { query: "old" },
      }),
    });
    expect(readSnapshot(storage)).toEqual({ ...snapshot(), rows: {} });
  });

  it("preserves a cached pagination cutoff", () => {
    const saved = snapshot(
      cached(Date.now(), {
        publishedAfter: "2026-01-01T00:00:00.000Z",
        nextPageToken: "next",
      }),
    );
    expect(
      readSnapshot(memoryStorage({ [SNAPSHOT_KEY]: JSON.stringify(saved) })),
    ).toEqual(saved);
  });
  it("loads the saved list immediately and persists before notifying subscribers", () => {
    const saved = snapshot();
    const storage = memoryStorage({ [SNAPSHOT_KEY]: JSON.stringify(saved) });
    const store = createStore(storage);
    expect(store.getSnapshot()).toEqual(saved);
    const listener = vi.fn(() =>
      expect(JSON.parse(storage.getItem(SNAPSHOT_KEY)!)).toEqual(
        store.getSnapshot(),
      ),
    );
    const unsubscribe = store.subscribe(listener);
    store.save(emptySnapshot());
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    store.save(saved);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("keeps the displayed snapshot and subscribers unchanged when writing fails", () => {
    const storage = memoryStorage();
    const store = createStore(storage);
    const before = store.getSnapshot();
    const listener = vi.fn();
    store.subscribe(listener);
    vi.mocked(storage.setItem).mockImplementation(() => {
      throw new Error("full");
    });
    expect(() => store.save(snapshot())).toThrow("Cannot save on this device");
    expect(store.getSnapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
    expect(() => store.setKey("key")).toThrow("Cannot save on this device");
  });

  it("rejects unsafe IDs and duplicates, and normalizes valid queries and API keys", () => {
    for (const id of ["search", "__proto__", "constructor", "bad id"]) {
      expect(() =>
        parseConfig({ version: 1, rows: [{ ...row, id }] }),
      ).toThrow();
    }
    expect(() => parseConfig({ version: 1, rows: [row, row] })).toThrow();
    expect(() =>
      parseConfig({
        version: 1,
        rows: [{ ...row, type: "channel", channelId: "invalid" }],
      }),
    ).toThrow();
    expect(
      parseConfig({
        version: 1,
        rows: [{ ...row, search: { ...row.search, query: " news " } }],
      }).rows,
    ).toEqual([row]);
    const storage = memoryStorage();
    const store = createStore(storage);
    store.setKey(" key ");
    expect(store.getKey()).toBe("key");
    expect(JSON.parse(storage.getItem(SNAPSHOT_KEY)!).apiKey).toBe("key");
    expect(() => store.setKey(" ")).toThrow("Enter your API key");
  });

  it("discards malformed, mismatched, expired and future caches but preserves valid config", () => {
    const now = Date.now();
    for (const result of [
      cached(now - RETENTION_MS),
      cached(now + 120_000),
      cached(now, { definitionKey: "search:other" }),
      cached(now, {
        videos: [
          { ...cached().videos[0], thumbnail: "https://evil.example/image" },
        ],
      }),
    ]) {
      const storage = memoryStorage({
        [SNAPSHOT_KEY]: JSON.stringify(snapshot(result)),
      });
      expect(readSnapshot(storage, now)).toEqual({
        ...snapshot(result),
        rows: {},
      });
      createStore(storage);
      expect(JSON.parse(storage.getItem(SNAPSHOT_KEY)!).rows).toEqual({});
    }
    expect(readSnapshot(memoryStorage({ [SNAPSHOT_KEY]: "{broken" }))).toEqual(
      emptySnapshot(),
    );
    expect(
      readSnapshot({
        getItem: () => {
          throw new Error("blocked");
        },
      }),
    ).toEqual(emptySnapshot());
  });

  it("prunes at the retention boundary", () => {
    const now = Date.now();
    const storage = memoryStorage();
    const store = createStore(storage);
    store.save(snapshot(cached(now - RETENTION_MS + 1)));
    store.prune(now);
    expect(store.getSnapshot().rows.news).toBeDefined();
    store.prune(now + 1);
    expect(store.getSnapshot().rows).toEqual({});
  });
});

describe("complete local settings", () => {
  it("round-trips the key, defaults and rows without exporting caches or ownership", () => {
    const storage = memoryStorage({
      [SNAPSHOT_KEY]: JSON.stringify(snapshot()),
    });
    const store = createStore(storage);
    const settings = {
      ...store.getSettings(),
      apiKey: " new-key ",
      searchDefaults: {
        ...DEFAULT_SEARCH_OPTIONS,
        order: "viewCount" as const,
        timeRange: "7d" as const,
        relevanceLanguage: " JA ",
        regionCode: " jp ",
        maxResults: 50,
        minDurationSeconds: 0,
      },
    };
    store.saveSettings(settings);
    const dumped = JSON.parse(JSON.stringify(store.getSettings()));
    expect(dumped).toEqual({
      version: 1,
      apiKey: "new-key",
      rows: [row],
      searchDefaults: {
        order: "viewCount",
        timeRange: "7d",
        relevanceLanguage: "ja",
        regionCode: "JP",
        maxResults: 50,
        minDurationSeconds: 0,
      },
    });
    const restored = createStore(memoryStorage());
    restored.saveSettings(dumped);
    expect(restored.getSettings()).toEqual(dumped);
    expect(createStore(storage).getSettings()).toEqual(dumped);
    expect(store.getSnapshot().rows.news).toBeDefined();
  });

  it("commits all settings in one write before notifying, including an empty local list", () => {
    const storage = memoryStorage({
      [SNAPSHOT_KEY]: JSON.stringify(snapshot()),
    });
    const store = createStore(storage);
    vi.mocked(storage.setItem).mockClear();
    const listener = vi.fn(() => {
      expect(JSON.parse(storage.getItem(SNAPSHOT_KEY)!)).toEqual(
        store.getSnapshot(),
      );
      expect(store.getKey()).toBe("replacement");
    });
    store.subscribe(listener);
    store.saveSettings({
      ...store.getSettings(),
      apiKey: "replacement",
      rows: [],
    });
    expect(storage.setItem).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledOnce();
    const reloaded = createStore(storage);
    expect(reloaded.getSnapshot()).toMatchObject({
      localConfig: true,
      rows: {},
      config: { rows: [] },
    });
    expect(reloaded.getKey()).toBe("replacement");
  });

  it("preserves only unchanged retrieval caches when lists are edited", () => {
    const store = createStore(
      memoryStorage({ [SNAPSHOT_KEY]: JSON.stringify(snapshot()) }),
    );
    store.saveSettings({
      ...store.getSettings(),
      rows: [{ ...row, label: "Renamed" }],
    });
    expect(store.getSnapshot().rows.news).toBeDefined();
    store.saveSettings({
      ...store.getSettings(),
      rows: [{ ...row, search: { ...row.search, query: "changed" } }],
    });
    expect(store.getSnapshot().rows).toEqual({});
  });

  it("invalid JSON settings and storage failures never partially change key or list", () => {
    const storage = memoryStorage({
      [SNAPSHOT_KEY]: JSON.stringify(snapshot()),
    });
    const store = createStore(storage);
    const before = store.getSnapshot();
    const persisted = storage.getItem(SNAPSHOT_KEY);
    const listener = vi.fn();
    store.subscribe(listener);
    for (const invalid of [
      { ...store.getSettings(), apiKey: "" },
      { ...store.getSettings(), searchDefaults: undefined },
      {
        ...store.getSettings(),
        searchDefaults: { ...DEFAULT_SEARCH_OPTIONS, maxResults: 51 },
      },
      {
        ...store.getSettings(),
        searchDefaults: { ...DEFAULT_SEARCH_OPTIONS, minDurationSeconds: -1 },
      },
      { ...store.getSettings(), rows: [row, row] },
    ]) {
      expect(() => store.saveSettings(invalid)).toThrow();
      expect(store.getSnapshot()).toBe(before);
    }
    vi.mocked(storage.setItem).mockImplementation(() => {
      throw new Error("full");
    });
    expect(() =>
      store.saveSettings({
        ...store.getSettings(),
        apiKey: "changed",
        rows: [],
      }),
    ).toThrow("Cannot save on this device");
    expect(store.getSnapshot()).toBe(before);
    expect(storage.getItem(SNAPSHOT_KEY)).toBe(persisted);
    expect(store.getKey()).toBe("key");
    expect(listener).not.toHaveBeenCalled();
  });

  it("keeps user settings through pruning and ignores unrecognized imported fields", () => {
    const now = Date.now();
    const store = createStore(
      memoryStorage({
        [SNAPSHOT_KEY]: JSON.stringify(
          snapshot(cached(now - RETENTION_MS + 1)),
        ),
      }),
    );
    store.saveSettings({
      ...store.getSettings(),
      searchDefaults: { ...DEFAULT_SEARCH_OPTIONS, order: "date" },
      rows: [row],
    });
    store.prune(now + 1);
    expect(store.getSettings().searchDefaults.order).toBe("date");
    expect(store.getSnapshot()).toMatchObject({
      apiKey: "key",
      localConfig: true,
      rows: {},
    });
    expect(
      parseSettings({
        ...store.getSettings(),
        cachedVideos: ["secret-runtime-data"],
      }),
    ).toEqual(store.getSettings());
  });
});
