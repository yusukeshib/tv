# TV

A small, offline-first YouTube interface for a Mac connected to a TV. React, TypeScript, Vite, and StyleX. Hosted on GitHub Pages; no backend.

**Open:** https://yusukeshib.github.io/tv/

The home screen is just search and horizontal video rows. Each row is a saved search or a favorite channel, always newest first. Scroll sideways for more; no categories, sorting menus, or “view all” screens.

## First run

1. In [Google Cloud](https://console.cloud.google.com/), create/select a project and enable **YouTube Data API v3**.
2. Create an API key. Set **Website / HTTP referrer restrictions** to `https://yusukeshib.github.io/*` and **API restrictions** to **YouTube Data API v3**. For local development, add `http://localhost:5173/*` or the exact development origin you use.
3. Open TV and enter the key once. It stays in that browser’s localStorage, not in GitHub, config.json, or the deployed JavaScript. Requests send it directly to Google.
4. Put Chrome in fullscreen and connect the Mac to the TV over HDMI.

To replace the key later, open `https://yusukeshib.github.io/tv/#setup` directly. There is intentionally no settings link on the home screen.

Browser storage is **not a secret vault**. Someone using the device, or JavaScript on the same origin, can access the key. GitHub Pages projects under `yusukeshib.github.io` share an origin; paths do not isolate secrets or HTTP referrer restrictions. Use a dedicated, restricted browser key, not a key used by other projects. Do not commit keys.

## Configure from another computer

Edit [`public/config.json`](public/config.json), then commit and push to `main`:

```json
{
  "version": 1,
  "rows": [
    {
      "id": "japan-news",
      "label": "Japan news",
      "type": "search",
      "query": "日本 ニュース"
    },
    {
      "id": "favorite-channel",
      "label": "Favorite channel",
      "type": "channel",
      "channelId": "UCxxxxxxxxxxxxxxxxxxxxxx"
    }
  ]
}
```

Replace the example channel ID with a real channel ID (`UC` followed by 22 characters), not an `@handle`. Keep row IDs stable and unique. `search` is reserved for the temporary search row. Reorder the array to reorder the home screen. An empty array is valid. Search queries can use any language; the interface is English.

The browser reads the **raw GitHub file**, not the cached Pages app, every minute while visible. GitHub/CDN delays can still affect freshness. Invalid config leaves the previous valid config in place. New or changed rows load immediately; changing only labels or order reuses saved videos.

This is a manually maintained channel list, not a sync of your signed-in YouTube subscriptions or personalized recommendations. No Google sign-in is required by this app. The official player may separately ask you to sign in for some content.

## Controls

- **Up / Down:** change rows; Up from the first row reaches search.
- **Left / Right:** select a video.
- **Enter:** play, or submit a search.
- **Escape:** return home when the app has keyboard focus.
- **Back to home:** visible outside the player. A cross-origin YouTube iframe captures its own keys; Escape cannot always reach the app. Use the pointer or tab out of the player to the back button.
- Submit an empty search to remove the temporary search row.

Mouse/trackpad input also works. A dedicated phone remote, HDMI-CEC control, and guaranteed remote-only control inside YouTube’s player are not included.

## Refresh and quotas

- **Config:** every minute while the page is visible.
- **Video rows:** every 10 minutes while visible. New searches and additional pages are separate requests.
- **App:** check for an updated service worker every minute. Download the complete new HTML/JS/CSS before activating it. If a video is open, wait until returning home, then reload once.
- **Resume:** check config and refresh overdue rows when the page becomes visible or connectivity returns.

As documented by YouTube, the standard project allowance is **100 `search.list` calls/day**, with a separate **10,000-unit/day** bucket for most other endpoints. Check your actual project quotas; they may differ. One search row used for six hours at a 10-minute interval needs about 36 calls; two need about 72, **plus startup, manual searches, config changes, and pagination**. Usage is shared across devices using the same project. Channel rows use the uploads playlist rather than the search endpoint.

On daily quota exhaustion, requests in the affected group pause until the next Pacific-time midnight. Rate limits respect a cooldown. Auth errors stop further YouTube calls until the key is saved again. Config and app updates continue independently.

Chrome can throttle timers, and no page code runs while the Mac sleeps or Chrome is closed. Turning off the TV alone does **not** necessarily hide the Chrome page or suspend the Mac, so requests may continue. Suspend the Mac or close/minimize Chrome when finished. Multiple open TV tabs can multiply requests; use one tab.

## Offline behavior

- **App shell:** service worker + Cache Storage; launches locally after one successful online visit and installation.
- **Config and video metadata:** localStorage is the display source of truth. Fetches are validated and saved before notifying React. Failed fetches/writes do not replace the current list.
- **Thumbnails:** bounded best-effort Cache Storage (250 images, up to 29 days).
- **Video metadata:** expired after 29 days, not kept indefinitely. The app removes expired entries when running.
- **Navigation state:** sessionStorage restores selection/scroll across an app-update reload.

Offline playback is **not supported**. The official YouTube iframe requires a connection. Not every video can be embedded; ads, age restrictions, regional restrictions, player UI, and account requirements remain under YouTube’s control. The app does not download videos or bypass restrictions.

A first-ever offline visit cannot work. Clearing site data, private browsing, browser eviction, or unavailable storage can remove the offline copy. Downloading only part of a new app does not replace the working version.

## Development (Bun)

Use Bun **1.4.2** (recorded in `package.json`).

```sh
bun install --frozen-lockfile
bun run dev
# http://localhost:5173/tv/

bun run test             # mocked data tests (Vitest)
bun run build           # TypeScript + production bundle + service worker
bunx playwright install chromium
bun run test:browser     # bounded production-build Chromium smoke tests
bun run format:check
```

Use `bun run test`, not Bun’s native `bun test`: these tests use Vitest mocks/timers. Service workers are enabled in production builds, not the dev server. `bun run preview` serves the built app locally. `tests/server.mjs` is only a local test harness, not a deployed backend; its version switches exercise successful and failed HTML-only updates.

UI styles use StyleX compiled at build time. No component framework or runtime CSS-in-JS engine is needed.

## Deployment

The `Deploy TV` GitHub Actions workflow builds with Bun and publishes `dist` to GitHub Pages on pushes to `main`. Repository **Settings → Pages → Source** must be **GitHub Actions**. The default base path is `/tv/`; if forking, update `src/sync.ts`’s public config URL, the Pages base path in `vite.config.ts`, and your API key’s website restrictions.

Rollback by reverting the relevant commit and pushing normally. The reverted build is delivered as a new service-worker update. Revert config changes similarly. Clearing site data is a last-resort recovery step: it deletes the saved key, lists, and offline copy.

## Validation limits

Automated tests use mocked YouTube responses and an embedded-player placeholder; they do not prove actual YouTube playback, API-key permissions, every video’s compatibility, sustained quota availability, or comfort on a physical TV. Those need a restricted real key and a Mac/HDMI smoke check.

References: [YouTube quotas](https://developers.google.com/youtube/v3/determine_quota_cost), [IFrame Player API](https://developers.google.com/youtube/iframe_api_reference), [YouTube API policies](https://developers.google.com/youtube/terms/developer-policies), [StyleX + Vite](https://stylexjs.com/docs/learn/installation/vite/).
