export interface SearchOptions {
  query: string;
  order: "relevance" | "viewCount" | "rating" | "date";
  timeRange: "24h" | "7d" | "30d" | "all";
  relevanceLanguage?: string;
  regionCode?: string;
  maxResults: number;
}

export type RowDefinition =
  | { id: string; label: string; type: "search"; search: SearchOptions }
  | { id: string; label: string; type: "channel"; channelId: string };

export interface Config {
  version: 1;
  rows: RowDefinition[];
}

export interface Video {
  id: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  publishedAt: string;
}

export interface VideoPage {
  videos: Video[];
  nextPageToken?: string;
  publishedAfter?: string;
}

export interface CachedRow extends VideoPage {
  definitionKey: string;
  updatedAt: number;
}

export interface Snapshot {
  version: 1;
  config: Config;
  rows: Record<string, CachedRow>;
}

export interface DisplayRow {
  id: string;
  label: string;
  videos: Video[];
  hasMore: boolean;
}

export interface HomeProps {
  rows: DisplayRow[];
  onPlay: (video: Video) => void;
  onLoadMore: (rowId: string) => void;
  loadingRows: readonly string[];
  notice?: string;
  hidden?: boolean;
}
