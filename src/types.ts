// Provider-independent minimum length for home videos.
export const DEFAULT_MIN_DURATION_SECONDS = 240;

export interface SearchOptions {
  query: string;
  order: "relevance" | "viewCount" | "rating" | "date";
  timeRange: "24h" | "7d" | "30d" | "all";
  relevanceLanguage?: string;
  regionCode?: string;
  maxResults: number;
  minDurationSeconds?: number;
}

export type SearchDefaults = Omit<SearchOptions, "query">;

export const DEFAULT_SEARCH_OPTIONS: SearchDefaults = {
  order: "relevance",
  timeRange: "all",
  maxResults: 25,
  minDurationSeconds: DEFAULT_MIN_DURATION_SECONDS,
};

export type RowDefinition =
  | { id: string; label: string; type: "search"; search: SearchOptions }
  | { id: string; label: string; type: "channel"; channelId: string };

export interface Config {
  version: 1;
  rows: RowDefinition[];
  searchDefaults?: SearchDefaults;
}

// The complete portable settings document; contains the secret API key.
export interface SettingsData extends Config {
  apiKey: string;
  searchDefaults: SearchDefaults;
}

export interface Video {
  id: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  publishedAt: string;
  // undefined: old cache; null: YouTube did not provide a count.
  viewCount?: number | null;
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
  apiKey?: string;
  localConfig?: boolean;
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
  onSettings: () => void;
  loadingRows: readonly string[];
  notice?: string;
  hidden?: boolean;
}
