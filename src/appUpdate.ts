let registration: ServiceWorkerRegistration | undefined;
let playing = false;
let applying = false;
let reloadRequested = false;

function applyWaiting() {
  if (
    playing ||
    document.hidden ||
    applying ||
    !registration?.waiting ||
    !navigator.serviceWorker.controller
  )
    return;
  applying = true;
  registration.waiting.postMessage({ type: "ACTIVATE_UPDATE" });
}
export function setPlaybackActive(active: boolean) {
  playing = active;
  if (!active) applyWaiting();
}
export async function startAppUpdates(): Promise<() => void> {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return () => {};
  const onControllerChange = () => {
    if (applying && !reloadRequested) {
      reloadRequested = true;
      window.location.reload();
    }
  };
  navigator.serviceWorker.addEventListener(
    "controllerchange",
    onControllerChange,
  );
  try {
    registration = await navigator.serviceWorker.getRegistration(
      import.meta.env.BASE_URL,
    );
    registration = await navigator.serviceWorker.register(
      `${import.meta.env.BASE_URL}sw.js`,
      {
        scope: import.meta.env.BASE_URL,
        updateViaCache: "none",
      },
    );
  } catch {
    // Keep checking an existing registration when an offline launch cannot fetch the script.
    if (!registration) {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
      return () => {};
    }
  }
  const onUpdateFound = () => {
    const worker = registration?.installing;
    worker?.addEventListener("statechange", () => {
      if (worker.state === "installed") applyWaiting();
    });
  };
  registration.addEventListener("updatefound", onUpdateFound);
  const check = () => {
    if (!document.hidden) {
      applyWaiting();
      void registration?.update().catch(() => {});
    }
  };
  document.addEventListener("visibilitychange", check);
  window.addEventListener("online", check);
  const interval = setInterval(check, 60_000);
  applyWaiting();
  return () => {
    clearInterval(interval);
    registration?.removeEventListener("updatefound", onUpdateFound);
    navigator.serviceWorker.removeEventListener(
      "controllerchange",
      onControllerChange,
    );
    document.removeEventListener("visibilitychange", check);
    window.removeEventListener("online", check);
  };
}
