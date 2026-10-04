import { useEffect, useState, useSyncExternalStore } from "react";
import {
  Link,
  Route,
  Routes,
  useLocation,
  useMatch,
  useNavigate,
} from "react-router-dom";
import { Home } from "./components/Home";
import { Player } from "./components/Player";
import { Setup } from "./components/Setup";
import { Settings } from "./components/Settings";
import { createStore } from "./store";
import { SyncController } from "./sync";
import { setPlaybackActive, startAppUpdates } from "./appUpdate";
import type { DisplayRow } from "./types";

function deviceStorage(): Storage {
  try {
    return window.localStorage;
  } catch {
    return {
      length: 0,
      key: () => null,
      getItem: () => null,
      removeItem: () => {},
      clear: () => {},
      setItem: () => {
        throw new Error("Device storage is unavailable.");
      },
    };
  }
}
const storage = deviceStorage();
const store = createStore(storage);
const sync = new SyncController(
  store,
  storage,
  undefined,
  import.meta.env.DEV ? `${import.meta.env.BASE_URL}config.json` : undefined,
);

export function App() {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const status = useSyncExternalStore(sync.subscribe, sync.getStatus);
  const key = snapshot.apiKey || "";
  const hasKey = !!key;
  const navigate = useNavigate();
  const location = useLocation();
  const setup = location.pathname === "/setup";
  const settings = location.pathname === "/settings";
  const watch = useMatch("/watch/:videoId");
  const video = [
    ...Object.values(snapshot.rows).flatMap((row) => row.videos),
    ...(snapshot.history ?? []).map((entry) => entry.video),
  ].find((candidate) => candidate.id === watch?.params.videoId);
  const [historyError, setHistoryError] = useState<string>();
  const [setupError, setSetupError] = useState<string>();
  const closePlayer = () => {
    if (location.state?.fromHome) navigate(-1);
    else navigate("/", { replace: true });
  };

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void startAppUpdates().then((stop) => {
      if (disposed) stop();
      else cleanup = stop;
    });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);
  useEffect(() => {
    if (!hasKey || setup) return;
    sync.start();
    return () => sync.stop();
  }, [hasKey, setup]);
  useEffect(() => {
    setPlaybackActive(!!video);
  }, [video]);

  useEffect(() => {
    const openSettings = (event: KeyboardEvent) => {
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
      if (!settings) navigate("/settings");
    };
    window.addEventListener("keydown", openSettings);
    return () => window.removeEventListener("keydown", openSettings);
  }, [navigate, settings]);

  const saveKey = (next: string) => {
    try {
      store.setKey(next);
      sync.resetKey();
      setSetupError(undefined);
      if (setup) navigate("/", { replace: true });
    } catch (error) {
      setSetupError(
        error instanceof Error ? error.message : "Couldn’t save your key.",
      );
    }
  };
  if ((!key && !settings) || setup)
    return (
      <Setup
        initialKey={key}
        onSave={saveKey}
        error={setupError}
        onSettings={() => navigate("/settings")}
        onClose={hasKey ? () => navigate("/", { replace: true }) : undefined}
      />
    );
  const rows: DisplayRow[] = snapshot.config.rows.map((row) => ({
    id: row.id,
    label: row.label,
    videos: snapshot.rows[row.id]?.videos || [],
    hasMore: !!snapshot.rows[row.id]?.nextPageToken,
  }));
  if (snapshot.history?.length)
    rows.push({
      id: ":history",
      label: "Recently watched",
      videos: snapshot.history.map((entry) => entry.video),
      hasMore: false,
    });
  return (
    <>
      <Home
        rows={rows}
        onPlay={(next) =>
          navigate(`/watch/${encodeURIComponent(next.id)}`, {
            state: { fromHome: true },
          })
        }
        onLoadMore={(id) => {
          void sync.loadMore(id);
        }}
        onSettings={() => navigate("/settings")}
        loadingRows={status.loadingRows}
        notice={historyError || status.notice}
        hidden={location.pathname !== "/"}
      />
      <Routes>
        <Route path="/" element={null} />
        <Route
          path="/settings"
          element={
            <Settings
              initial={store.getSettings()}
              onCancel={() => navigate("/", { replace: true })}
              onSave={(next) => {
                const previousKey = store.getKey();
                store.saveSettings(next);
                sync.settingsChanged(previousKey !== store.getKey());
                navigate("/", { replace: true });
              }}
            />
          }
        />
        <Route
          path="/watch/:videoId"
          element={
            video ? (
              <Player
                video={video}
                onClose={closePlayer}
                onPlayed={(played) => {
                  try {
                    store.recordWatch(played);
                    setHistoryError(undefined);
                  } catch (error) {
                    setHistoryError(
                      error instanceof Error
                        ? error.message
                        : "Could not save watch history.",
                    );
                  }
                }}
              />
            ) : (
              <main>
                <p role="status">
                  This video is not available in your saved library.
                </p>
                <Link to="/" replace>
                  Back to home
                </Link>
              </main>
            )
          }
        />
        <Route
          path="*"
          element={
            <main>
              <p>Page not found.</p>
              <Link to="/" replace>
                Back to home
              </Link>
            </main>
          }
        />
      </Routes>
    </>
  );
}
