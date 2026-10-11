import * as stylex from "@stylexjs/stylex";
import { Text } from "@radix-ui/themes";
import type { Video } from "../types";
import { theme } from "../theme.stylex";
import { formatViews } from "../formatViews";

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
        <Text size="3" weight="medium" {...stylex.props(styles.title)}>
          {video.title}
        </Text>
        <Text size="2" color="gray" {...stylex.props(styles.channel)}>
          {video.channelTitle}
        </Text>
        <div {...stylex.props(styles.meta, styles.details)}>
          <Text size="2" color="gray">
            {formatViews(video.viewCount)}
          </Text>
          {!Number.isNaN(date.getTime()) && (
            <Text size="2" color="gray" asChild>
              <time dateTime={video.publishedAt}>
                {date.toLocaleDateString("en-US")}
              </time>
            </Text>
          )}
        </div>
      </div>
    </button>
  );
}
const styles = stylex.create({
  card: {
    width: 284,
    maxWidth: "100%",
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    padding: 0,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: theme.outlineVariant,
    boxShadow: "none",
    appearance: "none",
    backgroundColor: theme.surface,
    color: theme.onSurface,
    textAlign: "left",
    cursor: "pointer",
    borderRadius: theme.radius,
    outline: "none",
    outlineOffset: 4,
  },
  active: {
    outline: `6px solid ${theme.focus}`,
    backgroundColor: theme.surfaceContainerLow,
  },
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
    gap: "var(--space-2)",
  },
  title: {
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    minHeight: `calc(2 * ${theme.titleMediumLine})`,
  },
  meta: {
    display: "flex",
    gap: 8,
    whiteSpace: "nowrap",
  },
  details: { justifyContent: "space-between" },
  channel: {
    display: "block",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    flexGrow: 1,
    minWidth: 0,
  },
});
