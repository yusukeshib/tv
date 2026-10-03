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
  onSearch,
  onPlay,
  onLoadMore,
  loadingRows,
  notice,
  hidden = false,
}: HomeProps) {
  const [query, setQuery] = useState("");
  const [saved] = useState(savedView);
  const restorePending = useRef(!!saved);
  const [selected, setSelected] = useState<Selection | null>(
    saved?.selection ?? null,
  );
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const search = useRef<HTMLInputElement>(null);
  const requested = useRef(
    new Map<string, { signature: string; at: number }>(),
  );
  const wasHidden = useRef(hidden);
  const cardHadFocus = useRef(!!saved);
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
        if (restorePending.current && saved) {
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
      search.current?.focus();
    wasHidden.current = hidden;
    return () => {
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
    if (event.target instanceof HTMLInputElement) {
      if (event.key === "ArrowDown" || event.key === "Escape") {
        event.preventDefault();
        focus(
          Math.max(
            0,
            rows.findIndex((r) => r.id === selected?.row),
          ),
          selected?.index ?? 0,
        );
      }
      return;
    }
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
      if (next < 0) search.current?.focus();
      else if (next < rows.length) focus(next, selected.index);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      search.current?.focus();
    }
  }
  return (
    <main hidden={hidden} {...stylex.props(styles.home)} onKeyDown={navigate}>
      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.wordmark)}>
          TV <span {...stylex.props(styles.tv)}>YouTube</span>
        </div>
        <form
          {...stylex.props(styles.form)}
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            onSearch(query.trim());
          }}
        >
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="10.5"
              cy="10.5"
              r="6.5"
              stroke="currentColor"
              strokeWidth="1.8"
            />
            <path d="m16 16 5 5" stroke="currentColor" strokeWidth="1.8" />
          </svg>
          <input
            ref={search}
            autoFocus
            {...stylex.props(styles.input)}
            aria-label="Search YouTube videos"
            placeholder="Search videos"
            value={query}
            onFocus={() => {
              cardHadFocus.current = false;
            }}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button {...stylex.props(styles.submit)} type="submit">
            Search
          </button>
        </form>
      </header>
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
            onPlay={onPlay}
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
          Search for videos or add a row in config.json.
        </p>
      )}
    </main>
  );
}
const styles = stylex.create({
  home: {
    minHeight: "100vh",
    backgroundColor: "#101014",
    color: "#f5f5f7",
    paddingBottom: 40,
    fontFamily: 'Inter, "Noto Sans JP", system-ui, sans-serif',
  },
  header: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 32,
    paddingInline: "clamp(24px, 4vw, 80px)",
    paddingBlock: "clamp(28px, 3.5vw, 64px)",
  },
  wordmark: {
    fontSize: "clamp(25px, 2vw, 38px)",
    fontWeight: 750,
    letterSpacing: "-0.04em",
  },
  tv: { color: "#a7a7b2", fontWeight: 400, marginLeft: 6 },
  form: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    backgroundColor: "#202027",
    borderRadius: 12,
    padding: 12,
    paddingLeft: 22,
    flexGrow: 1,
    maxWidth: 900,
    border: {
      default: "2px solid transparent",
      ":focus-within": "2px solid #d9d9e2",
    },
    color: "#a7a7b2",
  },
  input: {
    width: "100%",
    minWidth: 0,
    border: 0,
    outline: "none",
    backgroundColor: "transparent",
    color: "#fff",
    fontSize: "clamp(20px, 1.5vw, 28px)",
    lineHeight: 1.6,
  },
  submit: {
    backgroundColor: "#35353e",
    color: "#fff",
    border: 0,
    borderRadius: 7,
    paddingBlock: 10,
    paddingInline: 20,
    whiteSpace: "nowrap",
    fontSize: 18,
    cursor: "pointer",
    outline: { default: "none", ":focus-visible": "2px solid #fff" },
  },
  notice: {
    color: "#bbbcc7",
    fontSize: "clamp(17px, 1.3vw, 24px)",
    paddingInline: "clamp(24px, 4vw, 80px)",
    marginTop: 0,
    marginBottom: 30,
    lineHeight: 1.6,
  },
});
