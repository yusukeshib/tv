import * as stylex from "@stylexjs/stylex";
import type { Video } from "../types";

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
      {...stylex.props(styles.card)}
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
      <div {...stylex.props(styles.title)}>{video.title}</div>
      <div {...stylex.props(styles.meta)}>
        <span {...stylex.props(styles.channel)}>{video.channelTitle}</span>
        {!Number.isNaN(date.getTime()) && (
          <time dateTime={video.publishedAt}>
            {date.toLocaleDateString("en-US")}
          </time>
        )}
      </div>
    </button>
  );
}
const styles = stylex.create({
  card: {
    width: "clamp(260px, 27vw, 520px)",
    flexShrink: 0,
    padding: 0,
    border: 0,
    backgroundColor: "transparent",
    color: "#f5f5f7",
    textAlign: "left",
    cursor: "pointer",
    borderRadius: 10,
    outline: {
      default: "3px solid transparent",
      ":focus-visible": "3px solid #fff",
    },
    outlineOffset: 7,
  },
  imageWrap: {
    aspectRatio: "16 / 9",
    overflow: "hidden",
    borderRadius: 9,
    backgroundColor: "#202027",
  },
  image: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  title: {
    fontSize: "clamp(18px, 1.45vw, 28px)",
    fontWeight: 600,
    lineHeight: 1.5,
    marginTop: 15,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    minHeight: "3em",
  },
  meta: {
    display: "flex",
    gap: 14,
    color: "#a7a7b2",
    fontSize: "clamp(14px, 1vw, 20px)",
    lineHeight: 1.6,
    marginTop: 7,
  },
  channel: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    flexGrow: 1,
    minWidth: 0,
  },
});
