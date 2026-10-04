import { useEffect, useEffectEvent, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import type { Video } from "../types";
import { loadPlayerAPI, playbackError, type YouTubePlayer } from "../playerApi";

export const CONTROLS_HIDE_DELAY = 3_000;

function timestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return `${hours ? `${hours}:${String(minutes).padStart(2, "0")}` : minutes}:${String(total % 60).padStart(2, "0")}`;
}

export function Player({
  video,
  onClose,
  onPlayed,
}: {
  video: Video;
  onClose: () => void;
  onPlayed: (video: Video) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const player = useRef<YouTubePlayer | null>(null);
  const seekTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const pendingSeek = useRef<number | null>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const played = useEffectEvent(() => onPlayed(video));
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const showControls = () => {
    setControlsVisible(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(
      () => setControlsVisible(false),
      CONTROLS_HIDE_DELAY,
    );
  };
  useEffect(() => {
    showControls();
    return () => clearTimeout(hideTimer.current);
  }, []);
  const controlsShown = controlsVisible || !ready || !!error;

  useEffect(() => {
    // Focus once, not whenever background list/config updates rerender the parent.
    overlay.current?.focus();
    let focusTimer: ReturnType<typeof setTimeout> | undefined;
    const onKeyDown = (event: KeyboardEvent) => handleKey(event);
    const retainKeyboardFocus = () => {
      clearTimeout(focusTimer);
      focusTimer = setTimeout(() => {
        // Cross-origin player keys cannot bubble. Keep TV shortcuts active after
        // a video click without intercepting the player's clicks or links.
        const active = document.activeElement;
        if (
          document.hasFocus() &&
          active instanceof HTMLIFrameElement &&
          host.current?.contains(active)
        ) {
          overlay.current?.focus({ preventScroll: true });
        }
      }, 0);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", retainKeyboardFocus);
    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", retainKeyboardFocus);
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let recorded = false;
    let instance: YouTubePlayer | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    setReady(false);
    setError(undefined);
    setPosition(0);
    setDuration(0);
    const update = () => {
      if (disposed || !instance) return;
      if (pendingSeek.current === null)
        setPosition(Math.max(0, instance.getCurrentTime() || 0));
      setDuration(Math.max(0, instance.getDuration() || 0));
    };
    void loadPlayerAPI()
      .then((api) => {
        if (disposed || !host.current) return;
        // The API replaces this child, leaving React's host element intact.
        const target = document.createElement("div");
        host.current.replaceChildren(target);
        instance = new api.Player(target, {
          videoId: video.id,
          width: "100%",
          height: "100%",
          playerVars: {
            autoplay: 1,
            controls: 0,
            fs: 0,
            disablekb: 1,
            playsinline: 1,
            enablejsapi: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: ({ target: active }) => {
              if (disposed) return;
              player.current = active;
              setReady(true);
              update();
              timer = setInterval(update, 500);
              active.playVideo();
            },
            onStateChange: ({ data }) => {
              if (disposed) return;
              update();
              if (data === 1 && !recorded) {
                recorded = true;
                played();
              }
            },
            onAutoplayBlocked: () => {},

            onError: ({ data }) => {
              if (disposed) return;
              clearTimeout(seekTimer.current);
              pendingSeek.current = null;
              setError(playbackError(data));
            },
          },
        });
        player.current = instance;
        const frame = instance.getIframe();
        frame.title = video.title;
        frame.allow = "autoplay; encrypted-media";
        frame.allowFullscreen = false;
        frame.tabIndex = -1;
        frame.referrerPolicy = "strict-origin-when-cross-origin";
        frame.style.cssText =
          "position:absolute;left:50%;top:50%;width:max(100vw,177.777778vh);height:max(100vh,56.25vw);transform:translate(-50%,-50%);border:0;display:block";
      })
      .catch((failure: unknown) => {
        if (!disposed)
          setError(
            failure instanceof Error
              ? failure.message
              : "Could not load YouTube.",
          );
      });
    return () => {
      disposed = true;
      clearInterval(timer);
      clearTimeout(seekTimer.current);
      pendingSeek.current = null;
      player.current = null;
      instance?.destroy();
    };
  }, [video.id, attempt]);

  const enabled = ready && !error;
  const seek = (seconds: number) => {
    if (!enabled || !player.current || !duration) return;
    const next = Math.max(0, Math.min(duration, seconds));
    pendingSeek.current = next;
    setPosition(next);
    clearTimeout(seekTimer.current);
    seekTimer.current = setTimeout(() => {
      const target = pendingSeek.current;
      pendingSeek.current = null;
      if (target !== null) player.current?.seekTo(target, true);
    }, 200);
  };
  const togglePlayback = () => {
    if (!enabled || !player.current) return;
    if (player.current.getPlayerState() === 1) player.current.pauseVideo();
    else player.current.playVideo();
  };
  const handleKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing) return;
    showControls();
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target;
    if (
      target instanceof HTMLInputElement &&
      target.type === "range" &&
      event.key !== "Escape"
    )
      return;
    if (
      target instanceof HTMLButtonElement &&
      (event.code === "Space" || event.key === " ")
    )
      return;
    if (event.key === "Escape") {
      event.preventDefault();
      close.current();
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      if (enabled)
        seek(
          (pendingSeek.current ?? player.current?.getCurrentTime() ?? 0) +
            (event.key === "ArrowRight" ? 5 : -5) * (event.shiftKey ? 10 : 1),
        );
    } else if (event.code === "Space" || event.key === " ") {
      event.preventDefault();
      if (!event.repeat) togglePlayback();
    }
  });

  return (
    <div
      ref={overlay}
      tabIndex={-1}
      {...stylex.props(styles.overlay)}
      role="dialog"
      aria-modal="true"
      aria-label={video.title}
      onFocusCapture={(event) => {
        if (event.target !== event.currentTarget) showControls();
      }}
    >
      <header
        {...stylex.props(styles.header, !controlsShown && styles.hidden)}
        data-controls-visible={controlsShown}
      >
        <button
          {...stylex.props(styles.button)}
          onClick={onClose}
          aria-keyshortcuts="Escape"
        >
          ← Back to home
        </button>
      </header>
      <div ref={host} {...stylex.props(styles.frameWrap)} />
      {error && (
        <div {...stylex.props(styles.error)} role="alert">
          <span>{error}</span>
          <button
            {...stylex.props(styles.button)}
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry
          </button>
        </div>
      )}
      <footer
        {...stylex.props(styles.transport, !controlsShown && styles.hidden)}
        data-controls-visible={controlsShown}
        aria-label="Playback controls"
      >
        <div {...stylex.props(styles.timeline)}>
          <span {...stylex.props(styles.time)}>{timestamp(position)}</span>
          <input
            {...stylex.props(styles.seek)}
            type="range"
            data-player-seek
            style={{
              backgroundImage: `linear-gradient(to right, #fff ${duration ? (Math.min(position, duration) / duration) * 100 : 0}%, rgba(255,255,255,0.3) 0)`,
            }}
            aria-label="Seek"
            min={0}
            max={duration || 1}
            step={1}
            value={Math.min(position, duration || 1)}
            disabled={!enabled || !duration}
            onChange={(event) => seek(Number(event.target.value))}
          />
          <span {...stylex.props(styles.time)}>{timestamp(duration)}</span>
        </div>
        <span {...stylex.props(styles.time)}>
          Space: play/pause · ←/→: seek · Esc: Home · Ctrl/Cmd+,: Settings
        </span>
        {!ready && !error && (
          <span {...stylex.props(styles.time)} role="status">
            Loading player…
          </span>
        )}
      </footer>
    </div>
  );
}

const styles = stylex.create({
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 100,
    backgroundColor: "#09090c",
    color: "#f5f5f7",
    overflow: "hidden",
    fontFamily: "system-ui, sans-serif",
  },
  header: {
    position: "absolute",
    insetInline: 0,
    top: 0,
    zIndex: 1,
    transitionProperty: "opacity, visibility",
    transitionDuration: "180ms",
    display: "flex",
    alignItems: "center",
    padding: "clamp(16px, 2vw, 36px)",
    backgroundImage:
      "linear-gradient(to bottom, rgba(0,0,0,0.65), transparent)",
    pointerEvents: "none",
  },
  button: {
    color: "#fff",
    backgroundColor: "#272730",
    border: 0,
    borderRadius: 8,
    paddingBlock: 12,
    paddingInline: 22,
    fontSize: "clamp(17px, 1.3vw, 24px)",
    whiteSpace: "nowrap",
    pointerEvents: "auto",
    cursor: { default: "pointer", ":disabled": "default" },
    opacity: { default: 1, ":disabled": 0.4 },
    outline: {
      default: "2px solid transparent",
      ":focus-visible": "2px solid #fff",
    },
    outlineOffset: 4,
  },
  hidden: { opacity: 0, visibility: "hidden" },
  frameWrap: {
    position: "absolute",
    inset: 0,
    zIndex: 0,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  transport: {
    position: "absolute",
    insetInline: 0,
    bottom: 0,
    zIndex: 1,
    transitionProperty: "opacity, visibility",
    transitionDuration: "180ms",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: "clamp(16px, 2vw, 36px)",
    backgroundImage: "linear-gradient(to top, rgba(0,0,0,0.8), transparent)",
    pointerEvents: "none",
  },
  timeline: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    paddingBlock: 12,
    paddingInline: 16,
    borderRadius: 12,
    backgroundColor: "rgba(12,12,16,0.9)",
  },
  seek: {
    pointerEvents: "auto",
    flexGrow: 1,
    minWidth: 40,
    height: 6,
    margin: 0,
    appearance: "none",
    backgroundColor: "transparent",
    border: 0,
    borderRadius: 999,
    outline: { default: "none", ":focus-visible": "2px solid #fff" },
    outlineOffset: 4,
    cursor: "pointer",
  },
  time: {
    fontSize: "clamp(14px, 1vw, 18px)",
    color: "#bfbfc9",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
  buttons: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 },
  error: {
    position: "absolute",
    insetInline: "clamp(16px, 2vw, 36px)",
    top: "50%",
    transform: "translateY(-50%)",
    zIndex: 2,
    padding: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.85)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    fontSize: "clamp(16px, 1.2vw, 22px)",
    color: "#f5f5f7",
  },
});
