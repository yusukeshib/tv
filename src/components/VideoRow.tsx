import { useRef } from "react";
import * as stylex from "@stylexjs/stylex";
import type { DisplayRow, Video } from "../types";
import { VideoCard } from "./VideoCard";
interface Props {
  row: DisplayRow;
  activeId?: string;
  loading: boolean;
  register: (id: string, node: HTMLButtonElement | null) => void;
  onFocus: (video: Video) => void;
  onPlay: (video: Video) => void;
  onNearEnd: () => void;
}
export function VideoRow({
  row,
  activeId,
  loading,
  register,
  onFocus,
  onPlay,
  onNearEnd,
}: Props) {
  const scroll = useRef<HTMLDivElement>(null);
  return (
    <section {...stylex.props(styles.section)} aria-label={row.label}>
      <div {...stylex.props(styles.heading)}>
        <h2 {...stylex.props(styles.title)}>{row.label}</h2>
        {loading && (
          <span {...stylex.props(styles.status)} role="status">
            Loading…
          </span>
        )}
      </div>
      <div
        ref={scroll}
        data-row-scroll={row.id}
        {...stylex.props(styles.track)}
        onScroll={() => {
          const el = scroll.current;
          if (
            el &&
            el.scrollLeft > 0 &&
            el.scrollWidth - el.clientWidth - el.scrollLeft <
              el.clientWidth * 0.65
          )
            onNearEnd();
        }}
      >
        {row.videos.map((video, index) => (
          <VideoCard
            key={video.id}
            video={video}
            active={activeId === video.id}
            buttonRef={(node) => register(video.id, node)}
            onFocus={() => {
              onFocus(video);
              if (index >= row.videos.length - 3) onNearEnd();
            }}
            onPlay={() => onPlay(video)}
          />
        ))}
        {!row.videos.length && (
          <p {...stylex.props(styles.empty)}>
            {loading ? "Finding videos…" : "No videos available"}
          </p>
        )}
      </div>
    </section>
  );
}
const styles = stylex.create({
  section: { marginBottom: "clamp(32px, 4vw, 72px)" },
  heading: {
    display: "flex",
    alignItems: "baseline",
    gap: 24,
    paddingInline: "clamp(24px, 4vw, 80px)",
    marginBottom: 22,
  },
  title: {
    fontSize: "clamp(23px, 1.9vw, 36px)",
    fontWeight: 600,
    margin: 0,
    letterSpacing: "0.02em",
  },
  status: { color: "#a7a7b2", fontSize: 16 },
  track: {
    display: "flex",
    gap: "clamp(20px, 2vw, 36px)",
    overflowX: "auto",
    paddingInline: "clamp(24px, 4vw, 80px)",
    paddingBlock: 10,
    scrollbarWidth: "none",
  },
  empty: { color: "#a7a7b2", fontSize: 21, marginBlock: 24 },
});
