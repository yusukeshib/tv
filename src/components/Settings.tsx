import { useEffect, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { parseSettings } from "../store";
import { theme } from "../theme.stylex";
import {
  DEFAULT_MIN_DURATION_SECONDS,
  type RowDefinition,
  type SearchDefaults,
  type SettingsData,
} from "../types";

function SearchFields({
  options,
  onChange,
}: {
  options: SearchDefaults;
  onChange: (options: SearchDefaults) => void;
}) {
  return (
    <div {...stylex.props(styles.fields)}>
      <label {...stylex.props(styles.field)}>
        Candidate order
        <select
          {...stylex.props(styles.input)}
          value={options.order}
          onChange={(event) =>
            onChange({
              ...options,
              order: event.target.value as SearchDefaults["order"],
            })
          }
        >
          <option value="relevance">Relevance</option>
          <option value="viewCount">View count</option>
          <option value="rating">Rating</option>
          <option value="date">Date</option>
        </select>
      </label>
      <label {...stylex.props(styles.field)}>
        Time range
        <select
          {...stylex.props(styles.input)}
          value={options.timeRange}
          onChange={(event) =>
            onChange({
              ...options,
              timeRange: event.target.value as SearchDefaults["timeRange"],
            })
          }
        >
          <option value="all">All time</option>
          <option value="24h">Past 24 hours</option>
          <option value="7d">Past 7 days</option>
          <option value="30d">Past 30 days</option>
        </select>
      </label>
      <label {...stylex.props(styles.field)}>
        Language preference
        <input
          {...stylex.props(styles.input)}
          value={options.relevanceLanguage ?? ""}
          placeholder="Any (e.g. en, ja)"
          onChange={(event) =>
            onChange({
              ...options,
              relevanceLanguage: event.target.value || undefined,
            })
          }
          maxLength={8}
          spellCheck={false}
        />
      </label>
      <label {...stylex.props(styles.field)}>
        Region
        <input
          {...stylex.props(styles.input)}
          value={options.regionCode ?? ""}
          placeholder="Any (e.g. US, JP)"
          onChange={(event) =>
            onChange({
              ...options,
              regionCode: event.target.value || undefined,
            })
          }
          maxLength={2}
          spellCheck={false}
        />
      </label>
      <label {...stylex.props(styles.field)}>
        Results per page
        <input
          {...stylex.props(styles.input)}
          type="number"
          min={1}
          max={50}
          step={1}
          required
          value={Number.isFinite(options.maxResults) ? options.maxResults : ""}
          onChange={(event) =>
            onChange({ ...options, maxResults: event.target.valueAsNumber })
          }
        />
      </label>
      <label {...stylex.props(styles.field)}>
        Minimum duration (seconds)
        <input
          {...stylex.props(styles.input)}
          type="number"
          min={0}
          step={1}
          required
          value={
            Number.isFinite(
              options.minDurationSeconds ?? DEFAULT_MIN_DURATION_SECONDS,
            )
              ? (options.minDurationSeconds ?? DEFAULT_MIN_DURATION_SECONDS)
              : ""
          }
          onChange={(event) =>
            onChange({
              ...options,
              minDurationSeconds: event.target.valueAsNumber,
            })
          }
        />
      </label>
    </div>
  );
}

export function Settings({
  initial,
  onSave,
  onCancel,
}: {
  initial: SettingsData;
  onSave: (settings: SettingsData) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<SettingsData>(() =>
    structuredClone(initial),
  );
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [loading, setLoading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const loadGeneration = useRef(0);
  useEffect(() => {
    window.scrollTo({ top: 0 });
    return () => {
      loadGeneration.current++;
    };
  }, []);

  function updateRow(next: RowDefinition) {
    setDraft((current) => ({
      ...current,
      rows: current.rows.map((row) => (row.id === next.id ? next : row)),
    }));
  }
  function moveRow(id: string, direction: -1 | 1) {
    setDraft((current) => {
      const index = current.rows.findIndex((row) => row.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.rows.length)
        return current;
      const rows = [...current.rows];
      [rows[index], rows[target]] = [rows[target], rows[index]];
      return { ...current, rows };
    });
  }
  function addRow(type: RowDefinition["type"]) {
    const id = `row-${crypto.randomUUID()}`;
    const row: RowDefinition =
      type === "search"
        ? {
            id,
            type,
            label: "New search",
            search: { ...draft.searchDefaults, query: "" },
          }
        : { id, type, label: "New channel", channelId: "" };
    setDraft((current) => ({ ...current, rows: [...current.rows, row] }));
  }
  function report(error: unknown) {
    setError(
      error instanceof Error ? error.message : "Couldn’t update settings.",
    );
    setNotice(undefined);
  }
  async function load(file: File) {
    const generation = ++loadGeneration.current;
    setLoading(true);
    setError(undefined);
    setNotice(undefined);
    try {
      if (file.size > 256 * 1024)
        throw new Error("Settings JSON must be smaller than 256 KB.");
      const settings = parseSettings(JSON.parse(await file.text()));
      if (loadGeneration.current !== generation) return;
      setDraft(settings);
      setNotice(
        "Loaded settings into the editor. Save to replace your current settings, or Cancel to keep them.",
      );
    } catch (error) {
      if (loadGeneration.current === generation) report(error);
    } finally {
      if (loadGeneration.current === generation) setLoading(false);
    }
  }
  function dump() {
    try {
      const settings = parseSettings(draft);
      const url = URL.createObjectURL(
        new Blob([`${JSON.stringify(settings, null, 2)}\n`], {
          type: "application/json",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "tv-settings.json";
      link.click();
      URL.revokeObjectURL(url);
      setError(undefined);
      setNotice(
        "Dumped the settings currently in the editor, including your API key. Keep the file private.",
      );
    } catch (error) {
      report(error);
    }
  }

  return (
    <main {...stylex.props(styles.page)}>
      <form
        {...stylex.props(styles.form)}
        onSubmit={(event) => {
          event.preventDefault();
          try {
            onSave(parseSettings(draft));
          } catch (error) {
            report(error);
          }
        }}
      >
        <header {...stylex.props(styles.header)}>
          <h1 {...stylex.props(styles.title)}>Settings</h1>
          <button
            type="button"
            onClick={onCancel}
            {...stylex.props(styles.button)}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            {...stylex.props(styles.button, styles.primary)}
          >
            Save settings
          </button>
        </header>
        {error && (
          <p role="alert" {...stylex.props(styles.error)}>
            {error}
          </p>
        )}
        {notice && (
          <p role="status" {...stylex.props(styles.description)}>
            {notice}
          </p>
        )}
        <fieldset disabled={loading} {...stylex.props(styles.section)}>
          <legend>JSON Load / Dump</legend>
          <p {...stylex.props(styles.description)}>
            One file contains your Home list, search defaults and API key. Load
            replaces the editor’s contents; Save applies them. Dump exports the
            editor’s current settings.
          </p>
          <p {...stylex.props(styles.warning)}>
            This JSON contains your secret API key. Do not commit it to GitHub
            or share it publicly.
          </p>
          <div {...stylex.props(styles.actions)}>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              {...stylex.props(styles.button)}
            >
              Load JSON
            </button>
            <button
              type="button"
              onClick={dump}
              {...stylex.props(styles.button)}
            >
              Dump JSON
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              aria-label="Load settings JSON"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void load(file);
              }}
            />
          </div>
        </fieldset>
        <fieldset disabled={loading} {...stylex.props(styles.section)}>
          <legend>YouTube</legend>
          <label {...stylex.props(styles.field)}>
            API key
            <input
              autoFocus
              {...stylex.props(styles.input)}
              type="password"
              autoComplete="off"
              spellCheck={false}
              maxLength={500}
              required
              value={draft.apiKey}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  apiKey: event.target.value,
                }))
              }
            />
          </label>
        </fieldset>
        <fieldset disabled={loading} {...stylex.props(styles.section)}>
          <legend>Search defaults</legend>
          <p {...stylex.props(styles.description)}>
            Initial conditions for new searches. Existing searches keep their
            own conditions. Candidate order selects videos; results are
            displayed newest first.
          </p>
          <SearchFields
            options={draft.searchDefaults}
            onChange={(searchDefaults) =>
              setDraft((current) => ({ ...current, searchDefaults }))
            }
          />
        </fieldset>
        <fieldset disabled={loading} {...stylex.props(styles.section)}>
          <legend>Home list</legend>
          <p {...stylex.props(styles.description)}>
            GitHub supplies the defaults. Once you save here, your local list is
            authoritative, including deletions. Changes fetch videos only after
            saving.
          </p>
          {!draft.rows.length && (
            <p {...stylex.props(styles.description)}>
              Your Home list is empty.
            </p>
          )}
          {draft.rows.map((row, index) => (
            <fieldset key={row.id} {...stylex.props(styles.row)}>
              <legend>
                {index + 1}. {row.label || "Untitled"}
              </legend>
              <div {...stylex.props(styles.rowHeader)}>
                <label {...stylex.props(styles.field, styles.grow)}>
                  Label
                  <input
                    {...stylex.props(styles.input)}
                    required
                    maxLength={500}
                    value={row.label}
                    onChange={(event) =>
                      updateRow({ ...row, label: event.target.value })
                    }
                  />
                </label>
                <button
                  type="button"
                  aria-label={`Move ${row.label || "row"} up`}
                  disabled={index === 0}
                  onClick={() => moveRow(row.id, -1)}
                  {...stylex.props(styles.button)}
                >
                  ↑ Up
                </button>
                <button
                  type="button"
                  aria-label={`Move ${row.label || "row"} down`}
                  disabled={index === draft.rows.length - 1}
                  onClick={() => moveRow(row.id, 1)}
                  {...stylex.props(styles.button)}
                >
                  ↓ Down
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${row.label || "row"}`}
                  {...stylex.props(styles.button)}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      rows: current.rows.filter(
                        (candidate) => candidate.id !== row.id,
                      ),
                    }))
                  }
                >
                  Delete
                </button>
              </div>
              {row.type === "search" ? (
                <>
                  <label {...stylex.props(styles.field)}>
                    Search query
                    <input
                      {...stylex.props(styles.input)}
                      required
                      maxLength={500}
                      value={row.search.query}
                      onChange={(event) =>
                        updateRow({
                          ...row,
                          search: { ...row.search, query: event.target.value },
                        })
                      }
                    />
                  </label>
                  <SearchFields
                    options={row.search}
                    onChange={(options) =>
                      updateRow({
                        ...row,
                        search: { ...options, query: row.search.query },
                      })
                    }
                  />
                </>
              ) : (
                <label {...stylex.props(styles.field)}>
                  Channel ID
                  <input
                    {...stylex.props(styles.input)}
                    required
                    value={row.channelId}
                    placeholder="@handle or UC… channel ID"
                    spellCheck={false}
                    onChange={(event) =>
                      updateRow({ ...row, channelId: event.target.value })
                    }
                  />
                </label>
              )}
            </fieldset>
          ))}
          <div {...stylex.props(styles.actions)}>
            <button
              type="button"
              disabled={draft.rows.length >= 50}
              onClick={() => addRow("search")}
              {...stylex.props(styles.button)}
            >
              Add search
            </button>
            <button
              type="button"
              disabled={draft.rows.length >= 50}
              onClick={() => addRow("channel")}
              {...stylex.props(styles.button)}
            >
              Add channel
            </button>
          </div>
        </fieldset>
      </form>
    </main>
  );
}

const styles = stylex.create({
  page: {
    minHeight: "100vh",
    backgroundColor: theme.surface,
    color: theme.onSurface,
    padding: theme.gutter,
  },
  form: {
    maxWidth: 1100,
    marginInline: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 24,
  },
  header: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  title: { fontSize: 32, margin: 0, flexGrow: 1 },
  section: {
    margin: 0,
    border: `1px solid ${theme.outlineVariant}`,
    borderRadius: theme.radius,
    padding: 24,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 20,
  },
  row: {
    margin: 0,
    minWidth: 0,
    padding: 20,
    border: `1px solid ${theme.outlineVariant}`,
    borderRadius: theme.radius,
    backgroundColor: theme.surfaceContainerLow,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  rowHeader: { display: "flex", alignItems: "end", gap: 16, flexWrap: "wrap" },
  grow: { flexGrow: 1, minWidth: 0 },
  fields: {
    display: "grid",
    gridTemplateColumns: {
      default: "repeat(3, minmax(0, 1fr))",
      "@media (max-width: 900px)": "repeat(2, minmax(0, 1fr))",
      "@media (max-width: 600px)": "1fr",
    },
    gap: 16,
  },
  field: { display: "flex", flexDirection: "column", gap: 8, fontSize: 16 },
  input: {
    width: "100%",
    minWidth: 0,
    fontSize: 18,
    padding: 12,
    color: theme.onSurface,
    backgroundColor: theme.surface,
    border: `1px solid ${theme.outlineVariant}`,
    borderRadius: 8,
    outline: { default: "none", ":focus-visible": `3px solid ${theme.focus}` },
    outlineOffset: 3,
  },
  actions: { display: "flex", gap: 12, flexWrap: "wrap" },
  button: {
    paddingBlock: 12,
    paddingInline: 20,
    fontSize: 16,
    color: theme.onSurface,
    backgroundColor: theme.surfaceContainerLow,
    border: `1px solid ${theme.outlineVariant}`,
    borderRadius: 8,
    outline: { default: "none", ":focus-visible": `3px solid ${theme.focus}` },
    outlineOffset: 3,
    opacity: { default: 1, ":disabled": 0.5 },
  },
  primary: { color: theme.surface, backgroundColor: theme.onSurface },
  description: {
    color: theme.onSurfaceVariant,
    lineHeight: 1.6,
    fontSize: 16,
    margin: 0,
  },
  warning: { color: "#ffdfa0", lineHeight: 1.6, fontSize: 16, margin: 0 },
  error: { color: "#ffb8b8", lineHeight: 1.6, fontSize: 18, margin: 0 },
});
