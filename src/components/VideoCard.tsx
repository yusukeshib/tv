import * as stylex from "@stylexjs/stylex";
import type { Video } from "../types";
import { theme } from "../theme.stylex";

interface Props {
  video: Video;
  active: boolean;
  buttonRef: (node: HTMLButtonElement | null) => void;
  onFocus: () => void;
  onPlay: () => void;
}
export function VideoCard({
  video,
  active,
  buttonRef,
  onFocus,
  onPlay,
}: Props) {
  const date = new Date(video.publishedAt);
  return (
    <button
      ref={buttonRef}
      {...stylex.props(styles.card, active && styles.active)}
      tabIndex={active ? 0 : -1}
      onFocus={onFocus}
      onClick={onPlay}
      aria-label={`${video.title}, ${video.channelTitle}`}
    >
      <div {...stylex.props(styles.imageWrap)}>
        <img
          {...stylex.props(styles.image)}
          src={video.thumbnail}
          alt=""
          loading="lazy"
          crossOrigin="anonymous"
        />
      </div>
      <div {...stylex.props(styles.content)}>
        <div {...stylex.props(styles.title)}>{video.title}</div>
        <div {...stylex.props(styles.meta)}>
          <span {...stylex.props(styles.channel)}>{video.channelTitle}</span>
          {!Number.isNaN(date.getTime()) && (
            <time dateTime={video.publishedAt}>
              {date.toLocaleDateString("en-US")}
            </time>
          )}
        </div>
      </div>
    </button>
  );
}
const styles = stylex.create({
  card: {
    width: {
      default: `calc((100% - 4 * ${theme.cardGap}) / 5)`,
      "@media (max-width: 900px)": "calc((100% - 16px) / 2)",
    },
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    padding: 0,
    border: "none",
    boxShadow: "none",
    appearance: "none",
    backgroundColor: theme.surfaceContainerLow,
    color: theme.onSurface,
    textAlign: "left",
    cursor: "pointer",
    borderRadius: theme.radius,
    outline: "none",
    outlineOffset: 4,
  },
  active: { outline: `4px solid ${theme.focus}` },
  imageWrap: {
    aspectRatio: "16 / 9",
    overflow: "hidden",
    borderTopLeftRadius: theme.radius,
    borderTopRightRadius: theme.radius,
    backgroundColor: theme.surfaceContainerLow,
  },
  image: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  content: {
    padding: theme.cardInset,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  title: {
    fontSize: theme.titleMedium,
    fontWeight: 500,
    lineHeight: theme.titleMediumLine,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    minHeight: `calc(2 * ${theme.titleMediumLine})`,
  },
  meta: {
    display: "flex",
    gap: 8,
    color: theme.onSurfaceVariant,
    fontSize: theme.bodyMedium,
    whiteSpace: "nowrap",
    lineHeight: theme.bodyMediumLine,
  },
  channel: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    flexGrow: 1,
    minWidth: 0,
  },
});
