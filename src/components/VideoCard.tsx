import * as stylex from "@stylexjs/stylex";
import { Card, Flex, Inset, Text } from "@radix-ui/themes";
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
    <Card size="2" variant="surface" asChild>
      <button
        type="button"
        ref={buttonRef}
        {...stylex.props(styles.card, active && styles.active)}
        tabIndex={active ? 0 : -1}
        onFocus={onFocus}
        onClick={onPlay}
        aria-label={`${video.title}, ${video.channelTitle}`}
      >
        <Inset side="top" clip="padding-box" pb="current">
          <img
            {...stylex.props(styles.image)}
            src={video.thumbnail}
            alt=""
            loading="lazy"
            crossOrigin="anonymous"
          />
        </Inset>
        <Flex as="span" direction="column" gap="2">
          <Text size="3" weight="medium" {...stylex.props(styles.title)}>
            {video.title}
          </Text>
          <Text size="2" color="gray" {...stylex.props(styles.channel)}>
            {video.channelTitle}
          </Text>
          <Flex as="span" gap="2" justify="between" wrap="nowrap">
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
          </Flex>
        </Flex>
      </button>
    </Card>
  );
}
const styles = stylex.create({
  card: {
    width: 284,
    maxWidth: "100%",
    flexShrink: 0,
    cursor: "pointer",
    // The TV selection ring replaces Card's inset keyboard-focus outline.
    outline: { default: "none", "::after": "none" },
    outlineOffset: 4,
  },
  active: {
    outline: { default: `6px solid ${theme.focus}`, "::after": "none" },
  },
  image: {
    width: "100%",
    aspectRatio: "16 / 9",
    objectFit: "cover",
    display: "block",
    backgroundColor: theme.surfaceContainerLow,
  },
  title: {
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    minHeight: `calc(2 * ${theme.titleMediumLine})`,
  },
  channel: {
    display: "block",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    flexGrow: 1,
    minWidth: 0,
  },
});
