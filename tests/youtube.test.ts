import { describe, expect, it, vi } from "vitest";
import { newest, YouTubeClient } from "../src/youtube";
import { item, json, row, video } from "./fixtures";

const signal = () => new AbortController().signal;
describe("YouTube requests", () => {
  it("requests embeddable candidates with configured ranking and forwards pagination", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({
          items: [
            item("bbbbbbbbbbb"),
            item("aaaaaaaaaaa", "2026-02-01T00:00:00Z"),
            item("invalid"),
          ],
          nextPageToken: "next",
        }),
      )
      .mockResolvedValueOnce(
        json({
          items: [
            { id: "bbbbbbbbbbb", statistics: { viewCount: "0" } },
            { id: "aaaaaaaaaaa", statistics: { viewCount: "1234567" } },
          ],
        }),
      );
    const result = await new YouTubeClient(() => "secret", request).page(
      row,
      signal(),
      "page2",
    );
    const url = new URL(String(request.mock.calls[0][0]));
    expect(url.pathname).toBe("/youtube/v3/search");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      key: "secret",
      q: "news",
      order: "relevance",
      maxResults: "25",
      type: "video",
      videoEmbeddable: "true",
      pageToken: "page2",
    });
    expect(result.videos.map((v) => v.id)).toEqual([
      "aaaaaaaaaaa",
      "bbbbbbbbbbb",
    ]);
    expect(result.nextPageToken).toBe("next");
    expect(result.videos.map((video) => video.viewCount)).toEqual([1234567, 0]);
    const statisticsURL = new URL(String(request.mock.calls[1][0]));
    expect(statisticsURL.searchParams.get("part")).toBe("statistics");
    expect(statisticsURL.searchParams.get("id")).toBe(
      "bbbbbbbbbbb,aaaaaaaaaaa",
    );
  });

  it("forwards options and freezes relative cutoffs across pagination", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        json({ items: [], nextPageToken: "next" }),
      );
    const client = new YouTubeClient(() => "key", request);
    const now = vi
      .spyOn(Date, "now")
      .mockReturnValue(Date.parse("2026-02-10T12:00:00Z"));
    try {
      for (const [timeRange, days] of [
        ["24h", 1],
        ["7d", 7],
        ["30d", 30],
      ] as const) {
        const configured = {
          ...row,
          search: {
            ...row.search,
            order: "viewCount" as const,
            timeRange,
            relevanceLanguage: "en",
            regionCode: "US",
            maxResults: 50,
          },
        };
        const first = await client.page(configured, signal());
        expect(first.publishedAfter).toBe(
          new Date(Date.now() - days * 86400000).toISOString(),
        );
        now.mockReturnValue(Date.now() + 3600000);
        await client.page(configured, signal(), "next", first.publishedAfter);
        const params = new URL(String(request.mock.calls.at(-1)![0]))
          .searchParams;
        expect(Object.fromEntries(params)).toMatchObject({
          order: "viewCount",
          relevanceLanguage: "en",
          regionCode: "US",
          maxResults: "50",
          pageToken: "next",
          publishedAfter: first.publishedAfter,
        });
      }
      const all = await client.page(row, signal());
      expect(all.publishedAfter).toBeUndefined();
      expect(
        new URL(String(request.mock.calls.at(-1)![0])).searchParams.has(
          "publishedAfter",
        ),
      ).toBe(false);
    } finally {
      now.mockRestore();
    }
  });

  it("deduplicates IDs and resolves equal publication times deterministically", () => {
    expect(
      newest([
        video("bbbbbbbbbbb"),
        video(),
        { ...video(), title: "replacement" },
      ]),
    ).toEqual([{ ...video(), title: "replacement" }, video("bbbbbbbbbbb")]);
  });

  it("rejects missing keys without requesting and classifies authentication errors", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(json({}, 403));
    await expect(
      new YouTubeClient(() => "", request).page(row, signal()),
    ).rejects.toMatchObject({ kind: "auth" });
    expect(request).not.toHaveBeenCalled();
    await expect(
      new YouTubeClient(() => "key", request).page(row, signal()),
    ).rejects.toMatchObject({ kind: "auth" });
  });

  it("distinguishes quota, rate limits and generic API failures", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({ error: { errors: [{ reason: "quotaExceeded" }] } }, 403),
      )
      .mockResolvedValueOnce(json({}, 429, { "Retry-After": "120" }))
      .mockResolvedValueOnce(json({}, 500));
    const client = new YouTubeClient(() => "key", request);
    await expect(client.page(row, signal())).rejects.toMatchObject({
      kind: "quota",
    });
    await expect(client.page(row, signal())).rejects.toMatchObject({
      kind: "rate",
      retryAfter: 120_000,
    });
    await expect(client.page(row, signal())).rejects.toMatchObject({
      kind: "other",
    });
  });

  it("wraps offline failures but preserves cancellation", async () => {
    const failure = new TypeError("offline");
    const request = vi.fn<typeof fetch>().mockRejectedValue(failure);
    const client = new YouTubeClient(() => "key", request);
    await expect(client.page(row, signal())).rejects.toMatchObject({
      kind: "network",
    });
    const controller = new AbortController();
    controller.abort();
    await expect(client.page(row, controller.signal)).rejects.toBe(failure);
  });

  it("uses the uploads playlist, caches its ID and filters private or nonembeddable details", async () => {
    const publicItem = {
      ...item(),
      id: "aaaaaaaaaaa",
      status: { embeddable: true, privacyStatus: "public" },
    };
    const request = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/channels"))
        return json({
          items: [
            { contentDetails: { relatedPlaylists: { uploads: "uploads-id" } } },
          ],
        });
      if (url.pathname.endsWith("/playlistItems"))
        return json({
          items: [{ contentDetails: { videoId: "aaaaaaaaaaa" } }],
          nextPageToken: "more",
        });
      return json({
        items: [
          publicItem,
          {
            ...publicItem,
            id: "bbbbbbbbbbb",
            status: { embeddable: false, privacyStatus: "public" },
          },
          {
            ...publicItem,
            id: "ccccccccccc",
            status: { embeddable: true, privacyStatus: "private" },
          },
        ],
      });
    });
    const client = new YouTubeClient(() => "key", request);
    const channel = {
      id: "channel",
      label: "Channel",
      type: "channel" as const,
      channelId: `UC${"a".repeat(22)}`,
    };
    expect(
      (await client.page(channel, signal())).videos.map((v) => v.id),
    ).toEqual(["aaaaaaaaaaa"]);
    await client.page(channel, signal(), "more");
    const urls = request.mock.calls.map(([input]) => new URL(String(input)));
    expect(
      urls.filter((url) => url.pathname.endsWith("/channels")),
    ).toHaveLength(1);
    expect(urls[3].searchParams.get("playlistId")).toBe("uploads-id");
    expect(urls[3].searchParams.get("pageToken")).toBe("more");
    expect(urls[4].searchParams.get("id")).toBe("aaaaaaaaaaa");
  });
});
