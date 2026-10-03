import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStore, SNAPSHOT_KEY } from "../src/store";
import {
  CONFIG_INTERVAL,
  CONFIG_URL,
  nextQuotaReset,
  SyncController,
  VIDEO_INTERVAL,
} from "../src/sync";
import {
  cached,
  deferred,
  item,
  json,
  memoryStorage,
  row,
  snapshot,
} from "./fixtures";
import type { Snapshot } from "../src/types";

let documentStub: EventTarget & {
  hidden: boolean;
  createElement: () => { innerHTML: string; readonly value: string };
};
const controllers: SyncController[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-02-01T12:00:00Z"));
  documentStub = Object.assign(new EventTarget(), {
    hidden: true,
    createElement: () => ({
      innerHTML: "",
      get value() {
        return this.innerHTML;
      },
    }),
  });
  vi.stubGlobal("document", documentStub);
  vi.stubGlobal("window", new EventTarget());
});
afterEach(() => {
  controllers.forEach((controller) => controller.stop());
  controllers.length = 0;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function setup(
  saved = snapshot(),
  handler?: (url: URL) => Response | Promise<Response>,
) {
  const storage = memoryStorage({
    [SNAPSHOT_KEY]: JSON.stringify(saved),
  });
  const store = createStore(storage);
  const request = vi.fn<typeof fetch>().mockImplementation(async (input) => {
    const url = new URL(String(input));
    return handler
      ? handler(url)
      : String(input) === CONFIG_URL
        ? json(saved.config)
        : json({ items: [item()] });
  });
  const controller = new SyncController(store, storage, request);
  controllers.push(controller);
  controller.start();
  documentStub.hidden = false;
  return { store, storage, request, controller };
}
const apiCalls = (request: ReturnType<typeof vi.fn<typeof fetch>>) =>
  request.mock.calls.filter(([url]) => String(url) !== CONFIG_URL);

describe("background synchronization", () => {
  it("checks config every minute but refreshes cached videos only after ten minutes", async () => {
    const { request, controller } = setup();
    await controller.tick();
    expect(apiCalls(request)).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(CONFIG_INTERVAL);
    expect(
      request.mock.calls.filter(([url]) => String(url) === CONFIG_URL),
    ).toHaveLength(2);
    expect(apiCalls(request)).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(VIDEO_INTERVAL - CONFIG_INTERVAL);
    expect(apiCalls(request)).toHaveLength(2); // search + one batched statistics request
  });

  it("retains cached setup and videos when the config request fails", async () => {
    const saved = snapshot();
    const { store, controller, request } = setup(saved, () => json({}, 503));
    await controller.tick();
    expect(store.getSnapshot()).toEqual(saved);
    expect(apiCalls(request)).toHaveLength(0);
    expect(controller.getStatus().notice).toContain("Keeping your saved setup");
  });

  it("keeps unchanged row caches on config changes and failed video refreshes", async () => {
    const saved = snapshot(cached(Date.now() - VIDEO_INTERVAL));
    const changed = {
      version: 1,
      rows: [
        { ...row, label: "Renamed" },
        { ...row, id: "second", search: { ...row.search, query: "other" } },
      ],
    };
    const { store, controller } = setup(saved, (url) =>
      url.toString() === CONFIG_URL ? json(changed) : json({}, 500),
    );
    await controller.tick();
    expect(store.getSnapshot().config).toEqual(changed);
    expect(store.getSnapshot().rows.news).toEqual(saved.rows.news);
    expect(store.getSnapshot().rows.second).toBeUndefined();
    expect(controller.getStatus().notice).toContain("saved list is unchanged");
  });

  it("persists quota cooldown and skips other rows of the same request type", async () => {
    const saved: Snapshot = {
      ...snapshot(cached(Date.now() - VIDEO_INTERVAL)),
      config: { version: 1, rows: [row, { ...row, id: "second" }] },
    };
    const { controller, request, storage } = setup(saved, (url) =>
      url.toString() === CONFIG_URL
        ? json(saved.config)
        : json({ error: { errors: [{ reason: "quotaExceeded" }] } }, 403),
    );
    await controller.tick();
    expect(apiCalls(request)).toHaveLength(1);
    const backoff = JSON.parse(storage.getItem("tv.backoff.v1")!);
    expect(backoff.search).toBe(nextQuotaReset(Date.now()));
    await vi.advanceTimersByTimeAsync(CONFIG_INTERVAL);
    expect(apiCalls(request)).toHaveLength(1);
    controller.resetKey();
    expect(storage.getItem("tv.backoff.v1")).toBeNull();
    await controller.tick();
    expect(apiCalls(request)).toHaveLength(2);
  });

  it("merges pagination without duplicates and preserves the original refresh age", async () => {
    const original = cached(Date.now() - 1_000, { nextPageToken: "page2" });
    const { controller, store, request } = setup(snapshot(original), () =>
      json({
        items: [item(), item("bbbbbbbbbbb", "2026-02-01T00:00:00Z")].map(
          (video) => ({
            ...video,
            contentDetails: { duration: "PT10M" },
            statistics: { viewCount: "1000" },
          }),
        ),
      }),
    );
    await controller.loadMore("news");
    expect(
      new URL(String(request.mock.calls[0][0])).searchParams.get("pageToken"),
    ).toBe("page2");
    expect(store.getSnapshot().rows.news.videos.map((v) => v.id)).toEqual([
      "bbbbbbbbbbb",
      "aaaaaaaaaaa",
    ]);
    expect(store.getSnapshot().rows.news.updatedAt).toBe(original.updatedAt);
    await controller.loadMore("news");
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("ignores late pagination results after the row's search settings change", async () => {
    const response = deferred<Response>();
    const { controller, store } = setup(
      snapshot(cached(Date.now(), { nextPageToken: "page2" })),
      () => response.promise,
    );
    const pending = controller.loadMore("news");
    store.save({
      version: 1,
      config: {
        version: 1,
        rows: [{ ...row, search: { ...row.search, order: "viewCount" } }],
      },
      rows: {},
    });
    response.resolve(json({ items: [item()] }));
    await pending;
    expect(store.getSnapshot().rows.news).toBeUndefined();
    expect(controller.getStatus().loadingRows).toEqual([]);
  });

  it("does not accept late video results after stop and skips ticks while hidden", async () => {
    const response = deferred<Response>();
    const saved = snapshot(cached(Date.now(), { nextPageToken: "page2" }));
    const { controller, store, request } = setup(saved, () => response.promise);
    documentStub.hidden = true;
    await controller.tick();
    expect(request).not.toHaveBeenCalled();
    documentStub.hidden = false;
    const pending = controller.loadMore("news");
    controller.stop();
    response.resolve(json({ items: [item("bbbbbbbbbbb")] }));
    await pending;
    expect(store.getSnapshot()).toEqual(saved);
    expect(controller.getStatus().loadingRows).toEqual([]);
  });

  it("never replaces locally saved defaults or an empty list on later ticks and reloads", async () => {
    const { store, storage, request, controller } = setup();
    store.saveSettings({ ...store.getSettings(), rows: [] });
    controller.settingsChanged(false);
    await vi.advanceTimersByTimeAsync(CONFIG_INTERVAL * 2);
    expect(request).not.toHaveBeenCalled();
    expect(store.getSnapshot().config.rows).toEqual([]);
    expect(createStore(storage).getSnapshot().localConfig).toBe(true);
  });

  it("does not apply a GitHub defaults response racing a local save", async () => {
    const response = deferred<Response>();
    const { controller, store } = setup(snapshot(), () => response.promise);
    const pending = controller.tick();
    store.saveSettings({
      ...store.getSettings(),
      rows: [],
      apiKey: "local-key",
    });
    response.resolve(json({ version: 1, rows: [row] }));
    await pending;
    expect(store.getSnapshot().config.rows).toEqual([]);
    expect(store.getKey()).toBe("local-key");
    expect(controller.getStatus().notice).toBeUndefined();
  });

  it("keeps authentication errors visible after list edits until the key changes", async () => {
    const saved = snapshot(cached(Date.now() - VIDEO_INTERVAL));
    const { controller, store, request } = setup(saved, (url) =>
      url.toString() === CONFIG_URL
        ? json(saved.config)
        : json({ error: { errors: [{ reason: "keyInvalid" }] } }, 403),
    );
    await controller.tick();
    const notice = controller.getStatus().notice;
    expect(notice).toContain("API key");
    const calls = apiCalls(request).length;
    store.saveSettings({ ...store.getSettings(), rows: [] });
    controller.settingsChanged(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(controller.getStatus().notice).toBe(notice);
    expect(apiCalls(request)).toHaveLength(calls);
    store.saveSettings({
      ...store.getSettings(),
      apiKey: "new-key",
      rows: [row],
    });
    controller.settingsChanged(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(apiCalls(request)).toHaveLength(calls + 1);
  });

  it("aborts deleted rows and ignores late pagination after local edits", async () => {
    const response = deferred<Response>();
    const { controller, store } = setup(
      snapshot(cached(Date.now(), { nextPageToken: "next" })),
      () => response.promise,
    );
    const pending = controller.loadMore("news");
    store.saveSettings({ ...store.getSettings(), rows: [] });
    controller.settingsChanged(false);
    response.resolve(json({ items: [item()] }));
    await pending;
    expect(store.getSnapshot().rows).toEqual({});
    expect(controller.getStatus().loadingRows).toEqual([]);
  });

  it("refreshes a newly saved row immediately after an in-flight defaults tick finishes", async () => {
    const response = deferred<Response>();
    const { controller, store, request } = setup(snapshot(), (url) =>
      url.toString() === CONFIG_URL ? response.promise : json({ items: [] }),
    );
    const pending = controller.tick();
    store.saveSettings({
      ...store.getSettings(),
      rows: [{ ...row, search: { ...row.search, query: "local query" } }],
    });
    controller.settingsChanged(false);
    response.resolve(json({ version: 1, rows: [row] }));
    await pending;
    await vi.advanceTimersByTimeAsync(0);
    expect(apiCalls(request)).toHaveLength(1);
    expect(new URL(String(apiCalls(request)[0][0])).searchParams.get("q")).toBe(
      "local query",
    );
    expect(store.getSnapshot().rows.news).toBeDefined();
  });
});
