import { useEffect, useRef } from "react";
import * as stylex from "@stylexjs/stylex";
import type { Video } from "../types";

export function Player({
  video,
  onClose,
}: {
  video: Video;
  onClose: () => void;
}) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const handler = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  const params = new URLSearchParams({
    autoplay: "1",
    playsinline: "1",
    origin: window.location.origin,
  });
  return (
    <div
      {...stylex.props(styles.overlay)}
      role="dialog"
      aria-modal="true"
      aria-label={video.title}
    >
      <header {...stylex.props(styles.header)}>
        <button ref={close} {...stylex.props(styles.back)} onClick={onClose}>
          ← Back to home
        </button>
        <p {...stylex.props(styles.title)}>{video.title}</p>
      </header>
      <div {...stylex.props(styles.frameWrap)}>
        <iframe
          key={video.id}
          {...stylex.props(styles.frame)}
          src={`https://www.youtube.com/embed/${encodeURIComponent(video.id)}?${params}`}
          title={video.title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
      <p {...stylex.props(styles.hint)}>
        Escape cannot reach the app while the player has focus. Use Shift + Tab
        to reach Back to home. If a video cannot play, return home and choose
        another.
      </p>
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
    display: "flex",
    flexDirection: "column",
    padding: "clamp(16px, 2vw, 36px)",
    gap: 18,
    overflowY: "auto",
    fontFamily: "system-ui, sans-serif",
  },
  header: { display: "flex", alignItems: "center", gap: 28, flexShrink: 0 },
  back: {
    color: "#fff",
    backgroundColor: "#272730",
    border: 0,
    borderRadius: 9,
    paddingBlock: 13,
    paddingInline: 22,
    fontSize: "clamp(17px, 1.4vw, 26px)",
    whiteSpace: "nowrap",
    cursor: "pointer",
    outline: {
      default: "2px solid transparent",
      ":focus-visible": "2px solid #fff",
    },
    outlineOffset: 4,
  },
  title: {
    fontSize: "clamp(17px, 1.3vw, 24px)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    margin: 0,
    color: "#bfbfc9",
  },
  frameWrap: {
    flexGrow: 1,
    minHeight: 220,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  frame: {
    width: "100%",
    height: "100%",
    border: 0,
    minHeight: 220,
    backgroundColor: "#000",
  },
  hint: {
    color: "#93939f",
    fontSize: "clamp(13px, 0.9vw, 17px)",
    lineHeight: 1.6,
    margin: 0,
    flexShrink: 0,
  },
});
