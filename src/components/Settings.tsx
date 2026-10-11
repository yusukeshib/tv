import { useEffect, useLayoutEffect, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button, Callout, Heading, Text, TextField } from "@radix-ui/themes";
import { parseSettings } from "../store";
import { theme, layout } from "../theme.stylex";
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
      <Text asChild size="3" weight="medium">
        <label {...stylex.props(styles.field)}>
          Candidate order
          <select
            {...stylex.props(styles.select)}

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
      </Text>
      <Text asChild size="3" weight="medium">
        <label {...stylex.props(styles.field)}>
          Time range
          <select
            {...stylex.props(styles.select)}

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
      </Text>
      <Text asChild size="3" weight="medium">
        <label {...stylex.props(styles.field)}>
          Language preference
          <TextField.Root
            size="3"
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
      </Text>
      <Text asChild size="3" weight="medium">
        <label {...stylex.props(styles.field)}>
          Region
          <TextField.Root
            size="3"
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
      </Text>
      <Text asChild size="3" weight="medium">
        <label {...stylex.props(styles.field)}>
          Results per page
          <TextField.Root
            size="3"
            type="number"
            min={1}
            max={50}
            step={1}
            required
            value={
              Number.isFinite(options.maxResults) ? options.maxResults : ""
            }
            onChange={(event) =>
              onChange({ ...options, maxResults: event.target.valueAsNumber })
            }
          />
        </label>
      </Text>
      <Text asChild size="3" weight="medium">
        <label {...stylex.props(styles.field)}>
          Minimum duration (seconds)
          <TextField.Root
            size="3"
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
      </Text>
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
  const form = useRef<HTMLFormElement>(null);
  const rowFields = useRef(new Map<string, HTMLFieldSetElement>());
  const addSearch = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<{ id?: string; control?: string } | null>(null);
  useLayoutEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    pendingFocus.current = null;
    const row = pending.id ? rowFields.current.get(pending.id) : undefined;
    const control = pending.control
      ? row?.querySelector<HTMLButtonElement>(
          `[data-move="${pending.control}"]:not(:disabled)`,
        )
      : undefined;
    (
      control ??
      row?.querySelector<HTMLInputElement>("input") ??
      addSearch.current
    )?.focus();
  }, [draft.rows]);
  const fileInput = useRef<HTMLInputElement>(null);
  const loadGeneration = useRef(0);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.altKey ||
        event.shiftKey
      )
        return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (!event.repeat && !loading) form.current?.requestSubmit();
      } else if (
        !event.ctrlKey &&
        !event.metaKey &&
        event.key === "Escape" &&
        !event.repeat
      ) {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [loading, onCancel]);
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
    pendingFocus.current = { id, control: String(direction) };
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
    pendingFocus.current = { id };
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
        ref={form}
        {...stylex.props(styles.form)}
        onSubmit={(event) => {
          event.preventDefault();
          if (loading) return;
          try {
            onSave(parseSettings(draft));
          } catch (error) {
            report(error);
          }
        }}
      >
        <header {...stylex.props(styles.header)}>
          <Heading as="h1" size="7" {...stylex.props(styles.title)}>
            Settings
          </Heading>
          <Button
            size="3"
            variant="soft"
            type="button"
            onClick={onCancel}
            aria-keyshortcuts="Escape"
          >
            Cancel
          </Button>
          <Button
            size="3"
            variant="solid"
            type="submit"
            aria-keyshortcuts="Control+s Meta+s"
            disabled={loading}
          >
            Save settings
          </Button>
        </header>
        {error && (
          <Callout.Root role="alert" color="red">
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        )}
        {notice && (
          <Callout.Root role="status">
            <Callout.Text>{notice}</Callout.Text>
          </Callout.Root>
        )}
        <fieldset disabled={loading} {...stylex.props(styles.section)}>
          <Text asChild size="3" weight="bold">
            <legend>JSON Load / Dump</legend>
          </Text>
          <Text as="p" size="3" color="gray">
            One file contains your Home list, search defaults and API key. Load
            replaces the editor’s contents; Save applies them. Dump exports the
            editor’s current settings.
          </Text>
          <Callout.Root color="amber">
            <Callout.Text>
              This JSON contains your secret API key. Do not commit it to GitHub
              or share it publicly.
            </Callout.Text>
          </Callout.Root>
          <div {...stylex.props(styles.actions)}>
            <Button
              size="3"
              variant="soft"
              type="button"
              onClick={() => fileInput.current?.click()}
            >
              Load JSON
            </Button>
            <Button size="3" variant="soft" type="button" onClick={dump}>
              Dump JSON
            </Button>
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
          <Text asChild size="3" weight="bold">
            <legend>YouTube</legend>
          </Text>
          <Text asChild size="3" weight="medium">
            <label {...stylex.props(styles.field)}>
              API key
              <TextField.Root
                size="3"
                autoFocus
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
          </Text>
        </fieldset>
        <fieldset disabled={loading} {...stylex.props(styles.section)}>
          <Text asChild size="3" weight="bold">
            <legend>Search defaults</legend>
          </Text>
          <Text as="p" size="3" color="gray">
            Initial conditions for new searches. Existing searches keep their
            own conditions. Candidate order selects videos; results are
            displayed newest first.
          </Text>
          <SearchFields
            options={draft.searchDefaults}
            onChange={(searchDefaults) =>
              setDraft((current) => ({ ...current, searchDefaults }))
            }
          />
        </fieldset>
        <fieldset disabled={loading} {...stylex.props(styles.section)}>
          <Text asChild size="3" weight="bold">
            <legend>Home list</legend>
          </Text>
          <Text as="p" size="3" color="gray">
            GitHub supplies the defaults. Once you save here, your local list is
            authoritative, including deletions. Changes fetch videos only after
            saving.
          </Text>
          {!draft.rows.length && (
            <Text as="p" size="3" color="gray">
              Your Home list is empty.
            </Text>
          )}
          {draft.rows.map((row, index) => (
            <fieldset
              key={row.id}
              ref={(node) => {
                if (node) rowFields.current.set(row.id, node);
                else rowFields.current.delete(row.id);
              }}
              {...stylex.props(styles.row)}
            >
              <Text asChild size="3" weight="bold">
                <legend>
                  {index + 1}. {row.label || "Untitled"}
                </legend>
              </Text>
              <div {...stylex.props(styles.rowHeader)}>
                <Text asChild size="3" weight="medium">
                  <label {...stylex.props(styles.field, styles.grow)}>
                    Label
                    <TextField.Root
                      size="3"
                      required
                      maxLength={500}
                      value={row.label}
                      onChange={(event) =>
                        updateRow({ ...row, label: event.target.value })
                      }
                    />
                  </label>
                </Text>
                <Button
                  size="3"
                  variant="soft"
                  type="button"
                  aria-label={`Move ${row.label || "row"} up`}
                  disabled={index === 0}
                  data-move="-1"
                  onClick={() => moveRow(row.id, -1)}
                >
                  ↑ Up
                </Button>
                <Button
                  size="3"
                  variant="soft"
                  type="button"
                  aria-label={`Move ${row.label || "row"} down`}
                  disabled={index === draft.rows.length - 1}
                  data-move="1"
                  onClick={() => moveRow(row.id, 1)}
                >
                  ↓ Down
                </Button>
                <Button
                  size="3"
                  variant="soft"
                  type="button"
                  aria-label={`Delete ${row.label || "row"}`}
                  onClick={() => {
                    pendingFocus.current = {
                      id:
                        draft.rows[index + 1]?.id ?? draft.rows[index - 1]?.id,
                    };
                    setDraft((current) => ({
                      ...current,
                      rows: current.rows.filter(
                        (candidate) => candidate.id !== row.id,
                      ),
                    }));
                  }}
                >
                  Delete
                </Button>
              </div>
              {row.type === "search" ? (
                <>
                  <Text asChild size="3" weight="medium">
                    <label {...stylex.props(styles.field)}>
                      Search query
                      <TextField.Root
                        size="3"
                        required
                        maxLength={500}
                        value={row.search.query}
                        onChange={(event) =>
                          updateRow({
                            ...row,
                            search: {
                              ...row.search,
                              query: event.target.value,
                            },
                          })
                        }
                      />
                    </label>
                  </Text>
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
                <Text asChild size="3" weight="medium">
                  <label {...stylex.props(styles.field)}>
                    Channel ID
                    <TextField.Root
                      size="3"
                      required
                      value={row.channelId}
                      placeholder="@handle or UC… channel ID"
                      spellCheck={false}
                      onChange={(event) =>
                        updateRow({ ...row, channelId: event.target.value })
                      }
                    />
                  </label>
                </Text>
              )}
            </fieldset>
          ))}
          <div {...stylex.props(styles.actions)}>
            <Button
              size="3"
              variant="soft"
              type="button"
              disabled={draft.rows.length >= 50}
              ref={addSearch}
              onClick={() => addRow("search")}
            >
              Add search
            </Button>
            <Button
              size="3"
              variant="soft"
              type="button"
              disabled={draft.rows.length >= 50}
              onClick={() => addRow("channel")}
            >
              Add channel
            </Button>
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
    padding: layout.gutter,
  },
  form: {
    maxWidth: 1100,
    marginInline: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 24,
  },
  header: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  title: { flexGrow: 1 },
  section: {
    margin: 0,
    border: "1px solid var(--gray-6)",
    borderRadius: "var(--radius-3)",
    padding: { default: 24, "@media (max-width: 600px)": 12 },
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 20,
  },
  row: {
    margin: 0,
    minWidth: 0,
    padding: { default: 20, "@media (max-width: 600px)": 12 },
    border: "1px solid var(--gray-6)",
    borderRadius: "var(--radius-3)",
    backgroundColor: "var(--gray-2)",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  rowHeader: { display: "flex", alignItems: "end", gap: 12, flexWrap: "wrap" },
  grow: { flexGrow: 1, flexBasis: "100%", minWidth: 0 },
  fields: {
    display: "grid",
    gridTemplateColumns: {
      default: "repeat(3, minmax(0, 1fr))",
      "@media (max-width: 900px)": "repeat(2, minmax(0, 1fr))",
      "@media (max-width: 600px)": "1fr",
    },
    gap: 16,
  },
  field: { display: "flex", flexDirection: "column", gap: 8, minWidth: 0 },
  select: {
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    height: "var(--space-7)",
    fontSize: "var(--font-size-3)",
    fontFamily: "inherit",
    fontWeight: "var(--font-weight-regular)",
    paddingInline: "var(--space-3)",
    color: { default: "var(--gray-12)", ":disabled": "var(--gray-8)" },
    backgroundColor: {
      default: "var(--color-surface)",
      ":disabled": "var(--gray-2)",
    },
    border: "1px solid var(--gray-7)",
    borderRadius: "var(--radius-2)",
    outline: { default: "none", ":focus-visible": "2px solid var(--focus-8)" },
    outlineOffset: 2,
  },
  actions: { display: "flex", gap: 12, flexWrap: "wrap" },
});
