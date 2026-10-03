import { describe, expect, it, vi } from "vitest";
import {
  API_KEY,
  createStore,
  emptySnapshot,
  parseConfig,
  readSnapshot,
  RETENTION_MS,
  SNAPSHOT_KEY,
} from "../src/store";
import { cached, memoryStorage, row, snapshot } from "./fixtures";

describe("snapshot storage", () => {
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
    expect(() => store.setKey("key")).toThrow("Cannot save your API key");
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
      parseConfig({ version: 1, rows: [{ ...row, query: " news " }] }).rows,
    ).toEqual([row]);
    const storage = memoryStorage();
    const store = createStore(storage);
    store.setKey(" key ");
    expect(storage.getItem(API_KEY)).toBe("key");
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

  it("prunes at the retention boundary while retaining the saved search query", () => {
    const now = Date.now();
    const storage = memoryStorage();
    const store = createStore(storage);
    store.save({
      ...snapshot(cached(now - RETENTION_MS + 1)),
      search: { query: "news", result: cached(now - RETENTION_MS) },
    });
    store.prune(now);
    expect(store.getSnapshot().rows.news).toBeDefined();
    expect(store.getSnapshot().search).toEqual({ query: "news" });
    store.prune(now + 1);
    expect(store.getSnapshot().rows).toEqual({});
  });
});
