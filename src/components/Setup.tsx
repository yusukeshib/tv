import { useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button, Callout, Heading, Text, TextField } from "@radix-ui/themes";
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
        <Text as="p" size="3" color="gray">
          TV · First-time setup
        </Text>
        <Heading as="h1" size={{ initial: "7", sm: "9" }} id="setup-title">
          Your favorite videos,
          <br />
          on the big screen.
        </Heading>
        <Text as="p" size={{ initial: "4", sm: "5" }} color="gray">
          Enter your YouTube Data API key. It is saved only in this device’s
          browser, never in the public repository.
        </Text>
        <form
          ref={form}
          onSubmit={(event) => {
            event.preventDefault();
            if (key.trim()) onSave(key.trim());
          }}
          {...stylex.props(styles.form)}
        >
          <Text asChild size="4" weight="medium">
            <label htmlFor="api-key">API key</label>
          </Text>
          <TextField.Root
            size="3"
            id="api-key"
            autoFocus
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={key}
            onChange={(event) => setKey(event.target.value)}
            aria-describedby="key-guidance"
            aria-invalid={Boolean(error)}
            required
          />
          {error && (
            <Callout.Root role="alert" color="red">
              <Callout.Text>{error}</Callout.Text>
            </Callout.Root>
          )}
          <Button
            size="3"
            variant="solid"
            type="submit"
            aria-keyshortcuts="Control+s Meta+s"
            disabled={!key.trim()}
            {...stylex.props(styles.action)}
          >
            Save and start →
          </Button>
        </form>
        <Button
          size="3"
          variant="soft"
          type="button"
          onClick={onSettings}
          aria-keyshortcuts="Control+, Meta+,"
          {...stylex.props(styles.action)}
        >
          Open settings / Load JSON
        </Button>
        {onClose && (
          <Button
            size="3"
            variant="soft"
            type="button"
            onClick={onClose}
            aria-keyshortcuts="Escape"
            {...stylex.props(styles.action)}
          >
            Back to home
          </Button>
        )}
        <div id="key-guidance" {...stylex.props(styles.guidance)}>
          <Text as="p" size="3" color="gray">
            Enable YouTube Data API v3 in Google Cloud. Restrict your browser
            key to this site’s HTTP referrer and to the YouTube Data API.
          </Text>
          <Text as="p" size="3" color="gray">
            Browser storage is not a secret vault: device users and same-origin
            scripts can read the key. API quotas are limited; usage depends on
            the number of search rows and viewing time.
          </Text>
        </div>
      </section>
    </main>
  );
}
const styles = stylex.create({
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "clamp(24px, 5vw, 80px)",
    boxSizing: "border-box",
  },
  panel: {
    width: "100%",
    minWidth: 0,
    maxWidth: 900,
    display: "flex",
    flexDirection: "column",
    gap: 24,
  },
  form: { display: "flex", flexDirection: "column", gap: 14 },
  action: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    whiteSpace: "normal",
    height: "auto",
    minHeight: "var(--space-7)",
    paddingBlock: "var(--space-2)",
  },
  guidance: { display: "flex", flexDirection: "column", gap: 16, marginTop: 8 },
});
