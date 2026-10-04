import { useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
export function Setup({
  initialKey = "",
  onSave,
  onSettings,
  onClose,
  error,
}: {
  initialKey?: string;
  onSave: (key: string) => void;
  onSettings: () => void;
  onClose?: () => void;
  error?: string;
}) {
  const [key, setKey] = useState(initialKey);
  const form = useRef<HTMLFormElement>(null);
  return (
    <main
      {...stylex.props(styles.page)}
      onKeyDown={(event) => {
        if (
          event.defaultPrevented ||
          event.nativeEvent.isComposing ||
          event.altKey ||
          event.shiftKey
        )
          return;
        if (
          (event.ctrlKey || event.metaKey) &&
          event.key.toLowerCase() === "s"
        ) {
          event.preventDefault();
          if (!event.repeat) form.current?.requestSubmit();
          return;
        }
        if (event.repeat || event.ctrlKey || event.metaKey) return;
        if (event.key === "Escape" && onClose) {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <section {...stylex.props(styles.panel)} aria-labelledby="setup-title">
        <p {...stylex.props(styles.eyebrow)}>TV · First-time setup</p>
        <h1 id="setup-title" {...stylex.props(styles.title)}>
          Your favorite videos,
          <br />
          on the big screen.
        </h1>
        <p {...stylex.props(styles.description)}>
          Enter your YouTube Data API key. It is saved only in this device’s
          browser, never in the public repository.
        </p>
        <form
          ref={form}
          onSubmit={(event) => {
            event.preventDefault();
            if (key.trim()) onSave(key.trim());
          }}
          {...stylex.props(styles.form)}
        >
          <label htmlFor="api-key" {...stylex.props(styles.label)}>
            API key
          </label>
          <input
            id="api-key"
            autoFocus
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={key}
            onChange={(event) => setKey(event.target.value)}
            {...stylex.props(styles.input)}
            aria-describedby="key-guidance"
            aria-invalid={Boolean(error)}
            required
          />
          {error && (
            <p role="alert" {...stylex.props(styles.error)}>
              {error}
            </p>
          )}
          <button
            type="submit"
            aria-keyshortcuts="Control+s Meta+s"
            disabled={!key.trim()}
            {...stylex.props(styles.button)}
          >
            Save and start →
          </button>
        </form>
        <button
          type="button"
          onClick={onSettings}
          aria-keyshortcuts="Control+, Meta+,"
          {...stylex.props(styles.button)}
        >
          Open settings / Load JSON
        </button>
        <p {...stylex.props(styles.description)}>
          Save: Ctrl/Cmd+S · Settings: Ctrl/Cmd+,{onClose && " · Home: Esc"}
        </p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-keyshortcuts="Escape"
            {...stylex.props(styles.button)}
          >
            Back to home
          </button>
        )}
        <div id="key-guidance" {...stylex.props(styles.guidance)}>
          <p>
            Enable YouTube Data API v3 in Google Cloud. Restrict your browser
            key to this site’s HTTP referrer and to the YouTube Data API.
          </p>
          <p>
            Browser storage is not a secret vault: device users and same-origin
            scripts can read the key. API quotas are limited; usage depends on
            the number of search rows and viewing time.
          </p>
        </div>
      </section>
    </main>
  );
}
const styles = stylex.create({
  page: {
    minHeight: "100vh",
    backgroundColor: "#101014",
    color: "#f5f5f7",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "clamp(24px, 5vw, 80px)",
    boxSizing: "border-box",
    fontFamily: "system-ui, sans-serif",
  },
  panel: { width: "100%", maxWidth: 900 },
  eyebrow: {
    color: "#a7a7b2",
    fontSize: "clamp(16px, 1.2vw, 22px)",
    letterSpacing: "0.08em",
    marginTop: 0,
    marginBottom: 28,
  },
  title: {
    fontSize: "clamp(36px, 3.8vw, 68px)",
    lineHeight: 1.3,
    fontWeight: 650,
    letterSpacing: "-0.03em",
    marginTop: 0,
    marginBottom: 24,
  },
  description: {
    color: "#c3c3cd",
    fontSize: "clamp(18px, 1.4vw, 26px)",
    lineHeight: 1.8,
    marginBottom: 32,
  },
  form: { display: "flex", flexDirection: "column", gap: 14 },
  label: { fontSize: 20, fontWeight: 600 },
  input: {
    backgroundColor: "#202027",
    color: "#fff",
    border: "1px solid #555560",
    borderRadius: 9,
    fontSize: 25,
    padding: 18,
    width: "100%",
    boxSizing: "border-box",
    outline: { default: "none", ":focus-visible": "3px solid #fff" },
    outlineOffset: 3,
  },
  button: {
    alignSelf: "flex-start",
    color: "#101014",
    backgroundColor: { default: "#f5f5f7", ":disabled": "#73737d" },
    cursor: { default: "pointer", ":disabled": "default" },
    fontSize: 22,
    fontWeight: 600,
    paddingBlock: 17,
    paddingInline: 28,
    border: 0,
    borderRadius: 9,
    marginTop: 10,
    outline: { default: "none", ":focus-visible": "3px solid #fff" },
    outlineOffset: 5,
  },
  error: { color: "#ffb8b8", fontSize: 18, margin: 0, lineHeight: 1.6 },
  guidance: {
    color: "#a7a7b2",
    fontSize: "clamp(15px, 1.05vw, 20px)",
    lineHeight: 1.8,
    marginTop: 32,
  },
});
