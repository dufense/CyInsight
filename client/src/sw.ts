import { clientsClaim } from "workbox-core";
import {
  cleanupOutdatedCaches,
  matchPrecache,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { NetworkFirst, CacheFirst, NetworkOnly } from "workbox-strategies";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { ExpirationPlugin } from "workbox-expiration";

declare const self: ServiceWorkerGlobalScope;

self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);

cleanupOutdatedCaches();

registerRoute(
  /^\/api\/.*/,
  new NetworkOnly()
);

registerRoute(
  /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
  new CacheFirst({
    cacheName: "google-fonts-cache",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 365 * 24 * 60 * 60 }),
    ],
  })
);

const navigationHandler = new NetworkFirst({
  cacheName: "pages-cache",
  networkTimeoutSeconds: 3,
  plugins: [
    new CacheableResponsePlugin({ statuses: [200] }),
  ],
});

registerRoute(
  new NavigationRoute(async (options) => {
    try {
      return await navigationHandler.handle(options);
    } catch {
      const offlinePage = await matchPrecache("/offline.html");
      if (offlinePage) return offlinePage;
      const appShell = await matchPrecache("/index.html");
      if (appShell) return appShell;
      return Response.error();
    }
  }, {
    denylist: [/^\/api\//, /^\/offline\.html$/],
  })
);
