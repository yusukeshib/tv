# TV

A small, offline-first YouTube interface for a Mac connected to a TV. React, TypeScript, Vite, and StyleX. Hosted on GitHub Pages; no backend.

**Open:** https://yusukeshib.github.io/tv/

The home screen contains only horizontal video rows defined in config.json. There is no search box or local preset editor. Search conditions select the candidate videos; the retrieved candidates are displayed newest first. Scroll sideways for more; no categories, sorting menus, or “view all” screens.

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
      "search": {
        "query": "Japan news",
        "order": "viewCount",
        "timeRange": "7d",
        "relevanceLanguage": "en",
        "regionCode": "US",
        "maxResults": 25,
        "minDurationSeconds": 240
      }
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

Replace the example channel ID with a real channel ID (`UC` followed by 22 characters), not an `@handle`. Keep row IDs stable and unique. Reorder the array to reorder the home screen. An empty array is valid. Search queries can use any language; the interface is English.

Each search row has its own retrieval settings:

- `query`: search text.
- `order`: `relevance`, `viewCount`, `rating`, or `date`. This selects candidates; it is **not** the display sort. `viewCount` means total view count, not YouTube Trending.
- `timeRange`: `24h`, `7d`, `30d`, or `all`. Relative windows become a UTC `publishedAfter` cutoff, held fixed while paging through those results.
- `relevanceLanguage`: optional language preference, for example `en`. YouTube may still return other languages.
- `regionCode`: optional two-letter country code, for example `US`, for regional availability.
- `maxResults`: 1–50 candidates per API page.
- `minDurationSeconds`: optional provider-independent minimum video length in seconds (non-negative integer, default `240`). Filtering happens after retrieval, so a page may contain fewer displayed videos. Videos with missing or invalid durations are excluded when a positive minimum applies. `0` disables the minimum.

Home excludes videos shorter than four minutes by default, including on channel rows. This is a duration policy, not a YouTube Shorts classifier: short regular videos are excluded too, while videos longer than 20 minutes remain eligible. Search rows can override the minimum. Provider-specific duration retrieval and parsing stay inside the provider client.

The bundled config uses five specific channels (BBC News, Reuters, Marques Brownlee, Veritasium, and NASA) rather than broad keyword searches. The search example above retrieves the most-viewed candidates published in the past seven days, then displays those candidates newest first. This does not guarantee editorial quality or represent every video published in that time range. Loading additional pages fetches more candidates using the same settings and re-sorts the retrieved set by publication time.

Navigation uses React Router hash routes so GitHub Pages needs no server rewrite rules: `#/` for Home, `#/watch/:videoId` for playback, and `#/setup` for setup (`#setup` links remain supported). Browser Back/Forward and the player's Back/Escape restore Home's vertical and per-row horizontal scroll. Playback URLs resolve metadata from the saved library; unavailable videos show a Home link rather than fetching arbitrary provider metadata. URLs never include API keys.

Home keyboard scrolling is axis-specific: Left/Right reveal the selected card within that row without changing vertical scroll; Up/Down reveal the row heading and cards with focus-ring clearance. Navigating to the first selectable row resets vertical scroll to zero. Playback/history/reload restoration takes priority over that rule, preserving the exact saved offsets. Background updates retain the selected video and do not override manual scrolling.

Changing any retrieval setting invalidates that row’s cached results and pagination tokens. Config is the only source of presets; old ad-hoc search data is removed from local storage.

The deployed browser reads the **raw GitHub file**, not the cached Pages app, every minute while visible. The development server reads the local `public/config.json` instead, so unpushed edits can be previewed. GitHub/CDN delays can still affect freshness. Invalid config leaves the previous valid config in place. New or changed rows load immediately; changing only labels or order reuses saved videos.

This is a manually maintained channel list, not a sync of your signed-in YouTube subscriptions or personalized recommendations. No Google sign-in is required by this app. The official player may separately ask you to sign in for some content.

## Controls

- **Home:** Up / Down changes rows, Left / Right selects videos, Enter plays.
- **Player:** Left / Right seeks by 5 seconds; Space toggles playback; Escape returns home.
- A seek bar supports pointer input; Back to home remains available outside the player.

The official IFrame Player API handles playback. YouTube’s standard control bar is disabled; there are no fullscreen, mute, or transport-button toolbars. Chrome is already used fullscreen. The app retains keyboard focus after interaction with the iframe without placing a click-blocking overlay over it. It does not steal focus from another browser tab or application.

Mouse/trackpad input also works. A dedicated phone remote, HDMI-CEC control, and guaranteed remote-only control inside YouTube’s player are not included.

## Refresh and quotas

- **Config:** every minute while the page is visible.
- **Video rows:** every 10 minutes while visible. Changed search settings and additional pages are separate requests.
- **App:** check for an updated service worker every minute. Download the complete new HTML/JS/CSS before activating it. If a video is open, wait until returning home, then reload once.
- **Resume:** check config and refresh overdue rows when the page becomes visible or connectivity returns.

As documented by YouTube, the standard project allowance is **100 `search.list` calls/day**, with a separate **10,000-unit/day** bucket for most other endpoints. Check your actual project quotas; they may differ. One search row used for six hours at a 10-minute interval needs about 36 calls; two need about 72, **plus startup, config changes, and pagination**. Usage is shared across devices using the same project. Channel rows use the uploads playlist rather than the search endpoint.

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

UI styles use StyleX compiled at build time. The list uses Material 3 dark surface/type roles and the Android TV focus guidance, implemented with a small shared value file (`src/theme.stylex.ts`), not a component framework or theme engine. Desktop gutters are 48px, card gaps 24px, and card text insets 16px. Only the selected card has a white focus ring; no hover decoration or animation is added. References: [Material typography](https://github.com/material-components/material-web/blob/main/docs/theming/typography.md), [TV focus](https://developer.android.com/design/ui/tv/guides/styles/focus-system).

## Deployment

The `Deploy TV` GitHub Actions workflow builds with Bun and publishes `dist` to GitHub Pages on pushes to `main`. Repository **Settings → Pages → Source** must be **GitHub Actions**. The default base path is `/tv/`; if forking, update `src/sync.ts`’s public config URL, the Pages base path in `vite.config.ts`, and your API key’s website restrictions.

Rollback by reverting the relevant commit and pushing normally. The reverted build is delivered as a new service-worker update. Revert config changes similarly. Clearing site data is a last-resort recovery step: it deletes the saved key, lists, and offline copy.

## Validation limits

Automated tests use mocked YouTube responses and an embedded-player placeholder; they do not prove actual YouTube playback, API-key permissions, every video’s compatibility, sustained quota availability, or comfort on a physical TV. Those need a restricted real key and a Mac/HDMI smoke check.

References: [YouTube quotas](https://developers.google.com/youtube/v3/determine_quota_cost), [IFrame Player API](https://developers.google.com/youtube/iframe_api_reference), [YouTube API policies](https://developers.google.com/youtube/terms/developer-policies), [StyleX + Vite](https://stylexjs.com/docs/learn/installation/vite/).
