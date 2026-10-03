import type { RowDefinition, Video, VideoPage } from "./types";

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
  };
  status?: { embeddable?: boolean; privacyStatus?: string };
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
  ): Promise<VideoPage> {
    const pagination: Record<string, string> = pageToken ? { pageToken } : {};
    if (row.type === "search") {
      const result = await this.get(
        "search",
        {
          part: "snippet",
          type: "video",
          q: row.query,
          order: "date",
          videoEmbeddable: "true",
          maxResults: "25",
          ...pagination,
        },
        signal,
      );
      return {
        videos: newest(
          (result.items || [])
            .map(toVideo)
            .filter((video): video is Video => !!video),
        ),
        nextPageToken: result.nextPageToken,
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
      { part: "snippet,status", id: ids.join(",") },
      signal,
    );
    const videos = (details.items || [])
      .filter(
        (item) =>
          item.status?.embeddable && item.status.privacyStatus === "public",
      )
      .map(toVideo)
      .filter((video): video is Video => !!video);
    return { videos: newest(videos), nextPageToken: result.nextPageToken };
  }
}
