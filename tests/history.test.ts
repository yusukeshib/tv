import { describe, expect, it, vi } from "vitest";
import { createStore, RETENTION_MS, SNAPSHOT_KEY } from "../src/store";
import { memoryStorage, video } from "./fixtures";

describe("watch history", () => {
  it("persists recent unique videos independently of settings and row caches", () => {
    const storage = memoryStorage();
    const store = createStore(storage);
    const now = Date.now();
    store.recordWatch(video(), now - 2);
    store.recordWatch(video("bbbbbbbbbbb"), now - 1);
    store.recordWatch(video(), now);
    expect(store.getSnapshot().history?.map((entry) => entry.video.id)).toEqual(
      ["aaaaaaaaaaa", "bbbbbbbbbbb"],
    );
    store.saveSettings({ ...store.getSettings(), apiKey: "key", rows: [] });
    expect(createStore(storage).getSnapshot().history).toEqual(
      store.getSnapshot().history,
    );
    expect(store.getSettings()).not.toHaveProperty("history");
  });

  it("bounds history to 100 entries and prunes expired metadata", () => {
    const store = createStore(memoryStorage());
    const now = Date.now();
    for (let i = 0; i < 105; i++)
      store.recordWatch(video(String(i).padStart(11, "0")), now - 105 + i);
    expect(store.getSnapshot().history).toHaveLength(100);
    expect(store.getSnapshot().history?.[0].video.id).toBe("00000000104");
    store.prune(now + RETENTION_MS);
    expect(store.getSnapshot().history).toEqual([]);
  });

  it("discards malformed, future, expired and duplicate entries on reload", () => {
    const now = Date.now();
    const storage = memoryStorage();
    const store = createStore(storage);
    store.recordWatch(video(), now);
    const raw = JSON.parse(storage.getItem(SNAPSHOT_KEY)!);
    raw.history.push(
      null,
      { video: {}, watchedAt: now },
      { video: video("bbbbbbbbbbb"), watchedAt: now + 120_000 },
      { video: video("ccccccccccc"), watchedAt: now - RETENTION_MS },
      { video: video(), watchedAt: now - 1 },
    );
    storage.setItem(SNAPSHOT_KEY, JSON.stringify(raw));
    expect(createStore(storage).getSnapshot().history).toEqual([
      { video: video(), watchedAt: now },
    ]);
  });

  it("does not mutate history or notify subscribers when persistence fails", () => {
    const storage = memoryStorage();
    const store = createStore(storage);
    const before = store.getSnapshot();
    const listener = vi.fn();
    store.subscribe(listener);
    vi.mocked(storage.setItem).mockImplementation(() => {
      throw new Error("full");
    });
    expect(() => store.recordWatch(video())).toThrow("Cannot save");
    expect(store.getSnapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });
});
