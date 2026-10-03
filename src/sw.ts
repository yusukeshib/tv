/// <reference lib="webworker" />
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
  type PrecacheEntry,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: (PrecacheEntry | string)[];
};

// Workbox only installs a new worker once every required asset has been fetched.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(
  new NavigationRoute(
    createHandlerBoundToURL(`${import.meta.env.BASE_URL}index.html`),
  ),
);
registerRoute(
  ({ url, request }) =>
    request.destination === "image" && url.hostname === "i.ytimg.com",
  new CacheFirst({
    cacheName: "tv-thumbnails-v1",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 250,
        maxAgeSeconds: 29 * 24 * 60 * 60,
        purgeOnQuotaError: true,
      }),
    ],
  }),
);
self.addEventListener("message", (event) => {
  if (event.data?.type === "ACTIVATE_UPDATE") void self.skipWaiting();
});
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
