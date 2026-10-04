import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import * as stylex from "@stylexjs/stylex";
import type { HomeProps } from "../types";
import { VideoRow } from "./VideoRow";
import { theme } from "../theme.stylex";

type Selection = { row: string; video: string; index: number };
type View = {
  selection: Selection;
  top: number;
  tracks: Record<string, number>;
};
function savedView(): View | null {
  try {
    const value = JSON.parse(sessionStorage.getItem("tv.view") || "null");
    if (
      typeof value?.selection?.row !== "string" ||
      typeof value.selection.video !== "string" ||
      !Number.isInteger(value.selection.index) ||
      typeof value.top !== "number" ||
      !value.tracks ||
      typeof value.tracks !== "object"
    )
      return null;
    return value;
  } catch {
    return null;
  }
}
export function Home({
  rows,
  onPlay,
  onLoadMore,
  onSettings,
  loadingRows,
  notice,
  hidden = false,
}: HomeProps) {
  const [saved] = useState(savedView);
  const restorePending = useRef(!!saved);
  const [selected, setSelected] = useState<Selection | null>(
    saved?.selection ?? null,
  );
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const home = useRef<HTMLElement>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const gearHadFocus = useRef(false);
  const requested = useRef(
    new Map<string, { signature: string; at: number }>(),
  );
  const wasHidden = useRef(hidden);
  const playbackView = useRef<{
    top: number;
    tracks: Record<string, number>;
  } | null>(null);
  const cardHadFocus = useRef(true);
  const key = (row: string, video: string) => JSON.stringify([row, video]);
  const selectionRef = useRef(selected);
  selectionRef.current = selected;
  useEffect(() => {
    const save = () => {
      if (hidden || !selectionRef.current) return;
      const tracks: Record<string, number> = {};
      document
        .querySelectorAll<HTMLElement>("[data-row-scroll]")
        .forEach((track) => {
          tracks[track.dataset.rowScroll!] = track.scrollLeft;
        });
      playbackView.current = { top: window.scrollY, tracks };
      try {
        sessionStorage.setItem(
          "tv.view",
          JSON.stringify({
            selection: selectionRef.current,
            top: window.scrollY,
            tracks,
          }),
        );
      } catch {
        /* View restoration is optional. */
      }
    };
    window.addEventListener("pagehide", save);
    window.addEventListener("scroll", save, { capture: true, passive: true });
    return () => {
      window.removeEventListener("pagehide", save);
      window.removeEventListener("scroll", save, true);
    };
  }, [hidden]);
  useLayoutEffect(() => {
    if (!hidden && wasHidden.current && gearHadFocus.current) {
      settingsButton.current?.focus({ preventScroll: true });
      if (playbackView.current) {
        const view = playbackView.current;
        home.current
          ?.querySelectorAll<HTMLElement>("[data-row-scroll]")
          .forEach((track) => {
            track.scrollLeft = view.tracks[track.dataset.rowScroll!] ?? 0;
          });
        window.scrollTo({ top: view.top });
      }
    }
    const current = selectionRef.current;
    const row =
      rows.find((r) => r.id === current?.row && r.videos.length) ??
      rows.find((r) => r.videos.length);
    const video =
      row?.videos.find((v) => v.id === current?.video) ??
      row?.videos[
        Math.min(current?.index ?? 0, Math.max(0, row.videos.length - 1))
      ];
    if (row && video) {
      const next = {
        row: row.id,
        video: video.id,
        index: row.videos.indexOf(video),
      };
      if (
        !current ||
        next.row !== current.row ||
        next.video !== current.video ||
        next.index !== current.index
      ) {
        selectionRef.current = next;
        setSelected(next);
      }
      const node = buttons.current.get(key(row.id, video.id));
      if (
        !hidden &&
        !gearHadFocus.current &&
        node &&
        (cardHadFocus.current || wasHidden.current || restorePending.current)
      ) {
        node.focus({ preventScroll: true });
        if (wasHidden.current && playbackView.current) {
          const view = playbackView.current;
          home.current
            ?.querySelectorAll<HTMLElement>("[data-row-scroll]")
            .forEach((track) => {
              track.scrollLeft = view.tracks[track.dataset.rowScroll!] ?? 0;
            });
          window.scrollTo({ top: view.top });
        } else if (restorePending.current && saved) {
          document
            .querySelectorAll<HTMLElement>("[data-row-scroll]")
            .forEach((track) => {
              track.scrollLeft = saved.tracks[track.dataset.rowScroll!] || 0;
            });
          window.scrollTo({ top: saved.top });
          restorePending.current = false;
        } else if (
          !current ||
          current.row !== row.id ||
          current.video !== video.id
        ) {
          scrollSelection(node, rows.indexOf(row), true);
        }
      }
    } else if (
      !hidden &&
      !gearHadFocus.current &&
      (cardHadFocus.current || wasHidden.current)
    )
      home.current?.focus();
    wasHidden.current = hidden;
  }, [rows, hidden]);
  function scrollSelection(
    node: HTMLButtonElement,
    rowIndex: number,
    vertical: boolean,
  ) {
    const track = node.parentElement;
    if (!track) return;
    const trackRect = track.getBoundingClientRect();
    const cardRect = node.getBoundingClientRect();
    const trackStyle = getComputedStyle(track);
    const left = trackRect.left + parseFloat(trackStyle.paddingLeft);
    const right = trackRect.right - parseFloat(trackStyle.paddingRight);
    const horizontalDelta =
      cardRect.left < left
        ? cardRect.left - left
        : cardRect.right > right
          ? cardRect.right - right
          : 0;
    if (horizontalDelta)
      track.scrollBy({ left: horizontalDelta, behavior: "instant" });
    if (!vertical) return;
    if (rowIndex === rows.findIndex((row) => row.videos.length)) {
      window.scrollTo({ top: 0, behavior: "instant" });
      return;
    }
    const section = track.closest("section");
    if (!section) return;
    const rect = section.getBoundingClientRect();
    const inset = parseFloat(trackStyle.paddingTop);
    const bottom = window.innerHeight - inset;
    const delta =
      rect.top < inset || rect.height > bottom - inset
        ? rect.top - inset
        : rect.bottom > bottom
          ? rect.bottom - bottom
          : 0;
    if (delta) window.scrollBy({ top: delta, behavior: "instant" });
  }
  function focus(rowIndex: number, index: number, vertical: boolean) {
    const row = rows[rowIndex];
    const video =
      row?.videos[Math.min(Math.max(index, 0), row.videos.length - 1)];
    if (!video) return;
    const node = buttons.current.get(key(row.id, video.id));
    if (!node) return;
    node.focus({ preventScroll: true });
    scrollSelection(node, rowIndex, vertical);
  }
  function rememberView() {
    const tracks: Record<string, number> = {};
    home.current
      ?.querySelectorAll<HTMLElement>("[data-row-scroll]")
      .forEach((track) => {
        tracks[track.dataset.rowScroll!] = track.scrollLeft;
      });
    playbackView.current = { top: window.scrollY, tracks };
    if (!selectionRef.current) return;
    try {
      sessionStorage.setItem(
        "tv.view",
        JSON.stringify({
          ...playbackView.current,
          selection: selectionRef.current,
        }),
      );
    } catch {
      /* View restoration is optional. */
    }
  }
  function navigate(event: KeyboardEvent) {
    if (event.defaultPrevented || event.nativeEvent.isComposing) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
      return;
    if (event.target === settingsButton.current) return;
    const current = selectionRef.current;
    if (!current) return;
    const rowIndex = rows.findIndex((r) => r.id === current.row);
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      focus(
        rowIndex,
        current.index + (event.key === "ArrowRight" ? 1 : -1),
        false,
      );
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const direction = event.key === "ArrowUp" ? -1 : 1;
      let next = rowIndex + direction;
      while (next >= 0 && next < rows.length && !rows[next].videos.length)
        next += direction;
      if (next >= 0 && next < rows.length) focus(next, current.index, true);
      else if (
        event.key === "ArrowUp" &&
        rowIndex === rows.findIndex((row) => row.videos.length)
      )
        window.scrollTo({ top: 0, behavior: "instant" });
    }
  }
  useEffect(() => {
    if (hidden) return;
    const openSettings = (event: globalThis.KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.repeat ||
        event.altKey ||
        event.shiftKey ||
        !(event.ctrlKey || event.metaKey) ||
        event.key !== ","
      )
        return;
      event.preventDefault();
      rememberView();
      onSettings();
    };
    window.addEventListener("keydown", openSettings, true);
    return () => window.removeEventListener("keydown", openSettings, true);
  });
  return (
    <main
      ref={home}
      tabIndex={-1}
      hidden={hidden}
      {...stylex.props(styles.home)}
      onKeyDown={navigate}
      onBlurCapture={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget as Node)
        )
          cardHadFocus.current = false;
      }}
    >
      <div {...stylex.props(styles.toolbar)}>
        <button
          ref={settingsButton}
          type="button"
          aria-label="Settings"
          aria-keyshortcuts="Control+, Meta+,"
          {...stylex.props(styles.gear)}
          onFocus={() => {
            gearHadFocus.current = true;
            cardHadFocus.current = false;
          }}
          onClick={() => {
            rememberView();
            onSettings();
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path
              d="m9 3 1-2h4l1 2 2 1 2-.2 2 3.4-1.2 1.8v3.9l1.2 1.8-2 3.4-2-.2-2 1-1 2h-4l-1-2-2-1-2 .2-2-3.4L4.2 14v-3.9L3 8.3l2-3.4 2 .2Z"
              transform="translate(0 1)"
            />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      </div>
      {notice && (
        <p {...stylex.props(styles.notice)} role="status">
          {notice}
        </p>
      )}
      <div>
        {rows.map((row) => (
          <VideoRow
            key={row.id}
            row={row}
            activeId={selected?.row === row.id ? selected.video : undefined}
            loading={loadingRows.includes(row.id)}
            register={(id, node) => {
              const idKey = key(row.id, id);
              if (node) buttons.current.set(idKey, node);
              else buttons.current.delete(idKey);
            }}
            onFocus={(video) => {
              cardHadFocus.current = true;
              gearHadFocus.current = false;
              const next = {
                row: row.id,
                video: video.id,
                index: row.videos.indexOf(video),
              };
              selectionRef.current = next;
              setSelected(next);
            }}
            onPlay={(video) => {
              rememberView();
              onPlay(video);
            }}
            onNearEnd={() => {
              if (hidden || !row.hasMore || loadingRows.includes(row.id))
                return;
              const signature = JSON.stringify(row.videos.map((v) => v.id));
              const previous = requested.current.get(row.id);
              if (
                previous?.signature === signature &&
                Date.now() - previous.at < 60_000
              )
                return;
              requested.current.set(row.id, { signature, at: Date.now() });
              onLoadMore(row.id);
            }}
          />
        ))}
      </div>
      {!rows.length && (
        <p {...stylex.props(styles.notice)}>
          Open Settings to add a search or channel.
        </p>
      )}
    </main>
  );
}
const styles = stylex.create({
  home: {
    minHeight: "100vh",
    backgroundColor: theme.surface,
    color: theme.onSurface,
    paddingBlock: theme.pageInset,
    outline: "none",
  },
  toolbar: {
    display: "flex",
    justifyContent: "flex-end",
    paddingInline: theme.gutter,
    marginBottom: 12,
  },
  gear: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 44,
    height: 44,
    padding: 0,
    color: theme.onSurfaceVariant,
    backgroundColor: "transparent",
    border: 0,
    borderRadius: 8,
    outline: { default: "none", ":focus-visible": `3px solid ${theme.focus}` },
    outlineOffset: 3,
  },
  notice: {
    color: theme.onSurfaceVariant,
    fontSize: theme.titleMedium,
    paddingInline: theme.gutter,
    marginTop: 0,
    marginBottom: theme.sectionGap,
    lineHeight: theme.titleMediumLine,
  },
});
