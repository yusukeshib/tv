export interface YouTubePlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  isMuted(): boolean;
  mute(): void;
  unMute(): void;
  getIframe(): HTMLIFrameElement;
  destroy(): void;
}

interface PlayerEvent {
  target: YouTubePlayer;
  data?: number;
}
interface PlayerOptions {
  videoId: string;
  width: string;
  height: string;
  playerVars: Record<string, string | number>;
  events: {
    onReady(event: PlayerEvent): void;
    onStateChange(event: PlayerEvent): void;
    onError(event: PlayerEvent): void;
    onAutoplayBlocked(event: PlayerEvent): void;
  };
}
interface YouTubeAPI {
  Player: new (element: HTMLElement, options: PlayerOptions) => YouTubePlayer;
}
declare global {
  interface Window {
    YT?: YouTubeAPI;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let pending: Promise<YouTubeAPI> | undefined;
export function loadPlayerAPI(): Promise<YouTubeAPI> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const previous = window.onYouTubeIframeAPIReady;
    const finish = (error?: Error) => {
      clearTimeout(timeout);
      if (window.onYouTubeIframeAPIReady === ready)
        window.onYouTubeIframeAPIReady = previous;
      script.onerror = null;
      if (error) {
        script.remove();
        pending = undefined;
        reject(error);
      } else resolve(window.YT!);
    };
    const ready = () => {
      if (window.YT?.Player) finish();
      else finish(new Error("YouTube could not start. Please try again."));
      previous?.();
    };
    const timeout = window.setTimeout(
      () =>
        finish(
          new Error(
            "Could not load YouTube. Check your connection or content blocker.",
          ),
        ),
      15_000,
    );
    window.onYouTubeIframeAPIReady = ready;
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.referrerPolicy = "strict-origin-when-cross-origin";
    script.onerror = () =>
      finish(
        new Error(
          "Could not load YouTube. Check your connection or content blocker.",
        ),
      );
    document.head.appendChild(script);
  });
  return pending;
}

export function playbackError(code?: number): string {
  switch (code) {
    case 2:
      return "This video link is invalid.";
    case 5:
      return "YouTube could not play this video. Please try again.";
    case 100:
      return "This video is unavailable or private.";
    case 101:
    case 150:
      return "The owner does not allow this video to play outside YouTube.";
    case 153:
      return "YouTube could not identify this site. Check your browser’s referrer or privacy settings.";
    default:
      return "YouTube could not play this video.";
  }
}
