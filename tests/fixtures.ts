import { vi } from "vitest";
import type { CachedRow, Snapshot, Video } from "../src/types";
import { definitionKey } from "../src/store";

export const row = {
  id: "news",
  label: "News",
  type: "search" as const,
  search: {
    query: "news",
    order: "relevance" as const,
    timeRange: "all" as const,
    maxResults: 25,
  },
};
export const video = (
  id = "aaaaaaaaaaa",
  publishedAt = "2026-01-01T00:00:00Z",
): Video => ({
  id,
  title: id,
  channelTitle: "Channel",
  thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
  publishedAt,
});
export const cached = (
  updatedAt = Date.now(),
  overrides: Partial<CachedRow> = {},
): CachedRow => ({
  definitionKey: definitionKey(row),
  videos: [video()],
  updatedAt,
  ...overrides,
});
export const snapshot = (result = cached()): Snapshot => ({
  version: 1,
  config: { version: 1, rows: [row] },
  rows: { news: result },
});
export function memoryStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() {
      return values.size;
    },
    clear: vi.fn(() => values.clear()),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    key: vi.fn((index: number) => [...values.keys()][index] ?? null),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  };
}
export const json = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) => new Response(JSON.stringify(body), { status, headers });
export const item = (
  id = "aaaaaaaaaaa",
  publishedAt = "2026-01-01T00:00:00Z",
) => ({
  id: { videoId: id },
  snippet: { title: id, channelTitle: "Channel", publishedAt },
});
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
