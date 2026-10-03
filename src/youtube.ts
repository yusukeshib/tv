import type { RowDefinition, Video, VideoPage } from "./types";
import { DEFAULT_MIN_DURATION_SECONDS } from "./types";

export class YouTubeError extends Error {
  constructor(
    public kind: "quota" | "auth" | "rate" | "network" | "other",
    message: string,
    public retryAfter = 0,
  ) {
    super(message);
  }
}
interface Item {
  id?: string | { videoId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    publishedAt?: string;
    resourceId?: { videoId?: string };
    thumbnails?: Record<string, { url: string }>;
  };
  contentDetails?: {
    relatedPlaylists?: { uploads?: string };
    videoId?: string;
    videoPublishedAt?: string;
    duration?: string;
  };
  status?: { embeddable?: boolean; privacyStatus?: string };
  statistics?: { viewCount?: string };
}
interface Response {
  items?: Item[];
  nextPageToken?: string;
}

function decodeTitle(title: string): string {
  if (typeof document === "undefined") return title;
  const element = document.createElement("textarea");
  element.innerHTML = title;
  return element.value;
}
export function newest(videos: Video[]): Video[] {
  return [...new Map(videos.map((video) => [video.id, video])).values()].sort(
    (a, b) =>
      Date.parse(b.publishedAt) - Date.parse(a.publishedAt) ||
      a.id.localeCompare(b.id),
  );
}
function viewCount(item: Item): number | null {
  const value = item.statistics?.viewCount;
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const count = Number(value);
  return Number.isSafeInteger(count) ? count : null;
}
function durationSeconds(item: Item): number {
  const match =
    /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(
      item.contentDetails?.duration ?? "",
    );
  if (!match) return 0;
  return (
    Number(match[1] ?? 0) * 86400 +
    Number(match[2] ?? 0) * 3600 +
    Number(match[3] ?? 0) * 60 +
    Number(match[4] ?? 0)
  );
}
function toVideo(item: Item): Video | undefined {
  const id = typeof item.id === "object" ? item.id.videoId : item.id;
  const snippet = item.snippet;
  if (
    !id ||
    !/^[a-zA-Z0-9_-]{11}$/.test(id) ||
    !snippet?.publishedAt ||
    !Number.isFinite(Date.parse(snippet.publishedAt))
  )
    return;
  return {
    id,
    title: decodeTitle(snippet.title || ""),
    channelTitle: snippet.channelTitle || "",
    publishedAt: snippet.publishedAt,
    thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    viewCount: viewCount(item),
  };
}

export class YouTubeClient {
  private uploads = new Map<string, string>();
  constructor(
    private getKey: () => string,
    private request: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  private async get(
    endpoint: string,
    params: Record<string, string>,
    signal: AbortSignal,
  ): Promise<Response> {
    const key = this.getKey();
    if (!key)
      throw new YouTubeError("auth", "Set up your YouTube API key first.");
    const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
    url.search = new URLSearchParams({ ...params, key }).toString();
    let response: globalThis.Response;
    try {
      response = await this.request(url, {
        signal,
        cache: "no-store",
        referrerPolicy: "strict-origin-when-cross-origin",
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new YouTubeError(
        "network",
        "You’re offline. Showing saved videos.",
      );
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const reasons: string[] =
        body?.error?.errors?.map(
          (error: { reason?: string }) => error.reason,
        ) || [];
      if (
        reasons.some((reason) =>
          [
            "quotaExceeded",
            "dailyLimitExceeded",
            "dailyLimitExceededUnreg",
          ].includes(reason),
        )
      ) {
        throw new YouTubeError(
          "quota",
          "YouTube’s daily quota has been reached. Showing saved videos.",
        );
      }
      if (response.status === 429 || reasons.includes("rateLimitExceeded")) {
        const retry = response.headers.get("Retry-After");
        const retryAfter = retry
          ? Number.isFinite(Number(retry))
            ? Number(retry) * 1000
            : Date.parse(retry) - Date.now()
          : 60_000;
        throw new YouTubeError(
          "rate",
          "YouTube is busy. We’ll try again shortly.",
          Math.max(60_000, retryAfter || 0),
        );
      }
      if (
        response.status === 401 ||
        response.status === 403 ||
        reasons.some((reason) =>
          ["keyInvalid", "accessNotConfigured", "ipRefererBlocked"].includes(
            reason,
          ),
        )
      ) {
        throw new YouTubeError(
          "auth",
          "Check your API key, YouTube Data API access, and website restrictions. Open #setup to change the key.",
        );
      }
      throw new YouTubeError(
        "other",
        "Couldn’t fetch videos. Your saved list is unchanged.",
      );
    }
    return response.json();
  }

  async page(
    row: RowDefinition,
    signal: AbortSignal,
    pageToken?: string,
    publishedAfter?: string,
  ): Promise<VideoPage> {
    const pagination: Record<string, string> = pageToken ? { pageToken } : {};
    if (row.type === "search") {
      const options = row.search;
      const days = { "24h": 1, "7d": 7, "30d": 30, all: 0 }[options.timeRange];
      const cutoff = days
        ? (publishedAfter ??
          new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
        : undefined;
      const result = await this.get(
        "search",
        {
          part: "snippet",
          type: "video",
          q: options.query,
          order: options.order,
          videoEmbeddable: "true",
          maxResults: String(options.maxResults),
          ...(options.relevanceLanguage
            ? { relevanceLanguage: options.relevanceLanguage }
            : {}),
          ...(options.regionCode ? { regionCode: options.regionCode } : {}),
          ...(cutoff ? { publishedAfter: cutoff } : {}),
          ...pagination,
        },
        signal,
      );
      let videos = (result.items || [])
        .map(toVideo)
        .filter((video): video is Video => !!video);
      if (videos.length) {
        // Fetch duration and statistics together, never one request per card.
        const statistics = await this.get(
          "videos",
          {
            part: "statistics,contentDetails",
            id: videos.map((video) => video.id).join(","),
          },
          signal,
        );
        const counts = new Map(
          (statistics.items || []).map((item) => [
            typeof item.id === "object" ? item.id.videoId : item.id,
            viewCount(item),
          ]),
        );
        const eligible = new Set(
          (statistics.items || [])
            .filter(
              (item) =>
                durationSeconds(item) >=
                (options.minDurationSeconds ?? DEFAULT_MIN_DURATION_SECONDS),
            )
            .map((item) =>
              typeof item.id === "object" ? item.id.videoId : item.id,
            ),
        );
        videos = videos.filter((video) => eligible.has(video.id));
        for (const video of videos)
          video.viewCount = counts.get(video.id) ?? null;
      }
      return {
        videos: newest(videos),
        nextPageToken: result.nextPageToken,
        ...(cutoff ? { publishedAfter: cutoff } : {}),
      };
    }
    let playlistId = this.uploads.get(row.channelId);
    if (!playlistId) {
      const result = await this.get(
        "channels",
        { part: "contentDetails", id: row.channelId },
        signal,
      );
      playlistId = result.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
      if (!playlistId)
        throw new YouTubeError(
          "other",
          "Channel not found. Check its channelId in config.json.",
        );
      this.uploads.set(row.channelId, playlistId);
    }
    const result = await this.get(
      "playlistItems",
      { part: "contentDetails", playlistId, maxResults: "25", ...pagination },
      signal,
    );
    const ids = (result.items || [])
      .map((item) => item.contentDetails?.videoId)
      .filter((id): id is string => !!id);
    if (!ids.length) return { videos: [], nextPageToken: result.nextPageToken };
    const details = await this.get(
      "videos",
      { part: "snippet,status,statistics,contentDetails", id: ids.join(",") },
      signal,
    );
    const videos = (details.items || [])
      .filter(
        (item) =>
          item.status?.embeddable &&
          item.status.privacyStatus === "public" &&
          durationSeconds(item) >= DEFAULT_MIN_DURATION_SECONDS,
      )
      .map(toVideo)
      .filter((video): video is Video => !!video);
    return { videos: newest(videos), nextPageToken: result.nextPageToken };
  }
}
