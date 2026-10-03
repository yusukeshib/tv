import { useRef } from "react";
import * as stylex from "@stylexjs/stylex";
import type { DisplayRow, Video } from "../types";
import { VideoCard } from "./VideoCard";
import { theme } from "../theme.stylex";
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
  section: { marginBottom: theme.sectionGap },
  heading: {
    display: "flex",
    alignItems: "baseline",
    gap: 16,
    paddingInline: theme.gutter,
    marginBottom: 4,
  },
  title: {
    fontSize: theme.headlineSmall,
    lineHeight: theme.headlineSmallLine,
    fontWeight: 400,
    margin: 0,
  },
  status: { color: theme.onSurfaceVariant, fontSize: theme.bodyMedium },
  track: {
    display: "flex",
    gap: theme.cardGap,
    overflowX: "auto",
    marginInline: `calc(${theme.gutter} - ${theme.railInset})`,
    paddingInline: theme.railInset,
    paddingBlock: theme.railInset,
    scrollPaddingInline: theme.railInset,
    scrollbarWidth: "auto",
    scrollbarColor: `${theme.onSurfaceVariant} ${theme.surfaceContainerLow}`,
  },
  empty: {
    color: theme.onSurfaceVariant,
    fontSize: theme.titleMedium,
    marginBlock: theme.sectionGap,
  },
});
