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
  const requested = useRef(
    new Map<string, { signature: string; at: number }>(),
  );
  const wasHidden = useRef(hidden);
  const playbackView = useRef<{
    top: number;
    tracks: Record<string, number>;
  } | null>(null);
  const cardHadFocus = useRef(true);
  const anchor = useRef<{ x: number; y: number } | null>(null);
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
    return () => window.removeEventListener("pagehide", save);
  }, [hidden]);
  useLayoutEffect(() => {
    const current = selectionRef.current;
    const row =
      rows.find((r) => r.id === current?.row) ??
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
      )
        setSelected(next);
      const node = buttons.current.get(key(row.id, video.id));
      if (
        !hidden &&
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
          playbackView.current = null;
        } else if (restorePending.current && saved) {
          document
            .querySelectorAll<HTMLElement>("[data-row-scroll]")
            .forEach((track) => {
              track.scrollLeft = saved.tracks[track.dataset.rowScroll!] || 0;
            });
          window.scrollTo({ top: saved.top });
          restorePending.current = false;
        } else if (anchor.current && current?.video === video.id) {
          const rect = node.getBoundingClientRect();
          node.parentElement?.scrollBy({ left: rect.x - anchor.current.x });
          window.scrollBy({ top: rect.y - anchor.current.y });
        } else node.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    } else if (!hidden && (cardHadFocus.current || wasHidden.current))
      home.current?.focus();
    wasHidden.current = hidden;
    return () => {
      if (hidden) return;
      const s = selectionRef.current;
      const node = s && buttons.current.get(key(s.row, s.video));
      if (node) {
        const rect = node.getBoundingClientRect();
        anchor.current = { x: rect.x, y: rect.y };
      }
    };
  }, [rows, hidden]);
  function focus(rowIndex: number, index: number) {
    const row = rows[rowIndex];
    const video =
      row?.videos[Math.min(Math.max(index, 0), row.videos.length - 1)];
    if (!video) return;
    const node = buttons.current.get(key(row.id, video.id));
    node?.focus({ preventScroll: true });
    node?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  function navigate(event: KeyboardEvent) {
    if (!selected) return;
    const rowIndex = rows.findIndex((r) => r.id === selected.row);
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      focus(rowIndex, selected.index + (event.key === "ArrowRight" ? 1 : -1));
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const direction = event.key === "ArrowUp" ? -1 : 1;
      let next = rowIndex + direction;
      while (next >= 0 && next < rows.length && !rows[next].videos.length)
        next += direction;
      if (next >= 0 && next < rows.length) focus(next, selected.index);
    }
  }
  return (
    <main
      ref={home}
      tabIndex={-1}
      hidden={hidden}
      {...stylex.props(styles.home)}
      onKeyDown={navigate}
    >
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
              setSelected({
                row: row.id,
                video: video.id,
                index: row.videos.indexOf(video),
              });
            }}
            onPlay={(video) => {
              const tracks: Record<string, number> = {};
              home.current
                ?.querySelectorAll<HTMLElement>("[data-row-scroll]")
                .forEach((track) => {
                  tracks[track.dataset.rowScroll!] = track.scrollLeft;
                });
              playbackView.current = { top: window.scrollY, tracks };
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
          Add a row in config.json to get started.
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
  notice: {
    color: theme.onSurfaceVariant,
    fontSize: theme.titleMedium,
    paddingInline: theme.gutter,
    marginTop: 0,
    marginBottom: theme.sectionGap,
    lineHeight: theme.titleMediumLine,
  },
});
