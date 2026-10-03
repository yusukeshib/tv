import { useEffect, useState, useSyncExternalStore } from "react";
import { Home } from "./components/Home";
import { Player } from "./components/Player";
import { Setup } from "./components/Setup";
import { createStore } from "./store";
import { SyncController } from "./sync";
import { setPlaybackActive, startAppUpdates } from "./appUpdate";
import type { DisplayRow, Video } from "./types";

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
const sync = new SyncController(store, storage);

export function App() {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const status = useSyncExternalStore(sync.subscribe, sync.getStatus);
  const [key, setKey] = useState(store.getKey);
  const [setup, setSetup] = useState(location.hash === "#setup");
  const [setupError, setSetupError] = useState<string>();
  const [video, setVideo] = useState<Video>();

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
    if (!key || setup) return;
    sync.start();
    return () => sync.stop();
  }, [key, setup]);
  useEffect(() => {
    const changed = () => {
      setSetup(location.hash === "#setup");
      setVideo(undefined);
    };
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  useEffect(() => {
    setPlaybackActive(!!video);
  }, [video]);

  const saveKey = (next: string) => {
    try {
      store.setKey(next);
      sync.resetKey();
      setKey(next.trim());
      setSetup(false);
      setSetupError(undefined);
      if (location.hash === "#setup")
        history.replaceState(null, "", location.pathname + location.search);
    } catch (error) {
      setSetupError(
        error instanceof Error ? error.message : "Couldn’t save your key.",
      );
    }
  };
  if (!key || setup)
    return <Setup initialKey={key} onSave={saveKey} error={setupError} />;
  const rows: DisplayRow[] = snapshot.config.rows.map((row) => ({
    id: row.id,
    label: row.label,
    videos: snapshot.rows[row.id]?.videos || [],
    hasMore: !!snapshot.rows[row.id]?.nextPageToken,
  }));
  if (snapshot.search)
    rows.unshift({
      id: "search",
      label: snapshot.search.query,
      videos: snapshot.search.result?.videos || [],
      hasMore: !!snapshot.search.result?.nextPageToken,
    });
  return (
    <>
      <Home
        rows={rows}
        onSearch={(query) => {
          void sync.search(query);
        }}
        onPlay={setVideo}
        onLoadMore={(id) => {
          void sync.loadMore(id);
        }}
        loadingRows={status.loadingRows}
        notice={status.notice}
        hidden={!!video}
      />
      {video && <Player video={video} onClose={() => setVideo(undefined)} />}
    </>
  );
}
