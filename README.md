# TV

A small, offline-first YouTube interface for a Mac connected to a TV. React, TypeScript, Vite, and StyleX. Hosted on GitHub Pages; no backend.

**Open:** https://yusukeshib.github.io/tv/

The home screen contains horizontal video rows and a single **gear icon**. Open the gear to edit the Home list and all settings locally: add/edit searches or channels, delete any row (including defaults), and Load/Dump a complete settings JSON. There is no Home search box or Cmd+K popup. Search conditions select the candidate videos; the retrieved candidates are displayed newest first. Scroll sideways for more; no categories or “view all” screens.

## First run

1. In [Google Cloud](https://console.cloud.google.com/), create/select a project and enable **YouTube Data API v3**.
2. Create an API key. Set **Website / HTTP referrer restrictions** to `https://yusukeshib.github.io/*` and **API restrictions** to **YouTube Data API v3**. For local development, add `http://localhost:5173/*` or the exact development origin you use.
3. Open TV and enter the key once, or choose **Open settings / Load JSON** to import a settings file. The key stays with your settings in that browser’s localStorage, not in the public repository or deployed JavaScript. Requests send it directly to Google. A settings Dump includes the key; keep that JSON private.
4. Put Chrome in fullscreen and connect the Mac to the TV over HDMI.

To replace the key later, open the Home gear or `https://yusukeshib.github.io/tv/#/settings`. The first-run screen is also available at `#/setup` (`#setup` links remain supported).

Browser storage is **not a secret vault**. Someone using the device, or JavaScript on the same origin, can access the key. GitHub Pages projects under `yusukeshib.github.io` share an origin; paths do not isolate secrets or HTTP referrer restrictions. Use a dedicated, restricted browser key, not a key used by other projects. Do not commit keys.

## Defaults and local settings

[`public/config.json`](public/config.json) supplies the default Home list. Until you save local settings, the app checks these defaults every minute. After **Save settings**, your local document is authoritative: GitHub changes never overwrite your searches, conditions or deletions. Deleting every row is valid and the defaults do not reappear on reload.

The public defaults contain no API key. To change the defaults for devices that have not saved local settings, edit this file, then commit and push to `main`:

```json
{
  "version": 1,
  "searchDefaults": {
    "order": "relevance",
    "timeRange": "all",
    "maxResults": 25,
    "minDurationSeconds": 240
  },
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

For `channelId`, use either a channel ID (`UC` followed by 22 characters) or an `@handle` such as `@moozaru`. Handles are resolved with the official `channels.list` `forHandle` lookup (1 quota unit) and cached in memory until reload. Keep row IDs stable and unique. Reorder the array to reorder the home screen. An empty array is valid. Search queries can use any language; the interface is English.

### Edit, Load and Dump

The gear opens an editor with:

- **API key**.
- **Search defaults**: candidate order, time range, language preference, region, page size and minimum duration. New search rows copy these defaults; changing defaults does not rewrite existing searches.
- **Home list**: add searches/channels, edit labels and each row’s conditions, move rows **Up / Down**, or delete rows. Save applies the order to Home; JSON preserves it. Defaults are ordinary editable/deletable rows.
- **Load JSON** replaces the editor’s draft after validation, including the key and search defaults. **Save settings** applies everything together. **Cancel** leaves the saved settings unchanged. An invalid file or failed storage write does not partially apply changes.
- **Dump JSON** downloads the current valid draft, including unsaved edits. It contains every user setting, but no cached video metadata, quota cooldowns or navigation state.

The complete portable document looks like this (an empty `rows` array means an empty Home list):

```json
{
  "version": 1,
  "apiKey": "YOUR_PRIVATE_BROWSER_KEY",
  "searchDefaults": {
    "order": "relevance",
    "timeRange": "all",
    "maxResults": 25,
    "minDurationSeconds": 240
  },
  "rows": []
}
```

Optional `relevanceLanguage` and `regionCode` belong in `searchDefaults` and/or a search row’s `search` object. Load accepts complete settings files up to 256 KB, with at most 50 rows. It replaces rather than merges the list. Keep Dump files private: **they contain your API key. Never commit them to GitHub.** There is no migration of the old separately stored API key in this development phase; re-enter your key if prompted.

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

Navigation uses React Router hash routes so GitHub Pages needs no server rewrite rules: `#/` for Home, `#/settings` for settings, `#/watch/:videoId` for playback, and `#/setup` for setup (`#setup` links remain supported). Browser Back/Forward and the player's Back/Escape restore Home's vertical and per-row horizontal scroll. Playback URLs resolve metadata from the saved library; unavailable videos show a Home link rather than fetching arbitrary provider metadata. URLs never include API keys.

Home keyboard scrolling is axis-specific: Left/Right reveal the selected card within that row without changing vertical scroll; Up/Down reveal the row heading and cards with focus-ring clearance. Navigating to the first selectable row resets vertical scroll to zero. Playback/history/reload restoration takes priority over that rule, preserving the exact saved offsets. Background updates retain the selected video and do not override manual scrolling.

Changing any row’s retrieval setting invalidates that row’s cached results and pagination tokens. Changing a label, row order or search defaults preserves unchanged row caches. Removed rows lose their cached metadata. No provider requests run for draft edits; new/changed rows fetch after Save.

Before the first local settings save, the deployed browser reads the **raw GitHub defaults**, not the cached Pages app, every minute while visible. The development server reads the local `public/config.json` instead. GitHub/CDN delays can still affect freshness. Invalid defaults leave the previous valid config in place. Once settings are saved locally, remote defaults reads stop; video and app refreshes continue.

This is a manually maintained channel list, not a sync of your signed-in YouTube subscriptions or personalized recommendations. No Google sign-in is required by this app. The official player may separately ask you to sign in for some content.

## Controls

- **Any screen:** Ctrl+, / Cmd+, opens Settings; repeating it in Settings preserves the draft. From Home, it preserves selection and scroll just like the gear.
- **Home:** Up / Down changes rows, Left / Right selects videos, Enter plays.
- **Settings:** Tab / Shift+Tab moves between native controls; Enter / Space activates buttons and select arrows remain native. Ctrl+S / Cmd+S saves through normal form validation; Escape cancels, discards the draft, and returns Home. Invalid input or a storage failure keeps Settings open; Save is blocked while JSON loads. Load/Dump use native buttons and the browser file dialog.
- **Setup:** Ctrl+S / Cmd+S submits the key form. Escape returns Home only when a saved key exists.
- **Player:** Left / Right seeks by 5 seconds (Shift+Left / Right by 50 seconds); Space toggles playback; Escape returns home. Back and the seek bar hide after 3 seconds without input. Any key shows them immediately and restarts the timer. Mouse movement over the video cannot be detected because YouTube’s cross-origin iframe covers the screen; press a key to reveal the controls. They remain visible while loading or on an error.
- Player buttons retain native Enter / Space activation; the seek bar retains native keyboard and pointer input. Tab reaches app controls without entering the YouTube frame. Ctrl/Alt/Cmd combinations and IME composition do not trigger playback or Home arrow navigation.
- App shortcuts do not control native OS file dialogs or YouTube’s cross-origin sign-in/ad controls.

The official IFrame Player API handles playback. The player fills the browser viewport edge-to-edge with a centered 16:9 embed, scaled like `cover`: wide or tall viewports crop the excess instead of shrinking the video to leave room for controls. Back and the seek bar overlay the video with subtle gradients. The embed is confined to a lower stacking layer; the seek bar uses an explicit bright track and thumb on a dark panel so it remains legible over the video. Non-16:9 source videos may still have letterboxing inside YouTube’s player. YouTube’s standard control bar is disabled; there are no fullscreen, mute, or transport-button toolbars. Chrome is already used fullscreen; the app does not request native browser fullscreen. The app retains keyboard focus after interaction with the iframe without placing a click-blocking overlay over it. It does not steal focus from another browser tab or application.

Mouse/trackpad input also works. A dedicated phone remote, HDMI-CEC control, and guaranteed remote-only control inside YouTube’s player are not included.

## Refresh and quotas

- **Default config:** every minute while visible, until settings are saved locally. Local settings are not remotely overwritten.
- **Video rows:** every 10 minutes while visible. Changed search settings and additional pages are separate requests.
- **App:** check for an updated service worker every minute. Download the complete new HTML/JS/CSS before activating it. If a video is open, wait until returning home, then reload once.
- **Resume:** check defaults if still using them, and refresh overdue rows when the page becomes visible or connectivity returns.

As documented by YouTube, the standard project allowance is **100 `search.list` calls/day**, with a separate **10,000-unit/day** bucket for most other endpoints. Check your actual project quotas; they may differ. One search row used for six hours at a 10-minute interval needs about 36 calls; two need about 72, **plus startup, config changes, and pagination**. Usage is shared across devices using the same project. Channel rows use the uploads playlist rather than the search endpoint.

On daily quota exhaustion, requests in the affected group pause until the next Pacific-time midnight. Rate limits respect a cooldown. Auth errors stop further YouTube calls until the key is saved again. Config and app updates continue independently.

Chrome can throttle timers, and no page code runs while the Mac sleeps or Chrome is closed. Turning off the TV alone does **not** necessarily hide the Chrome page or suspend the Mac, so requests may continue. Suspend the Mac or close/minimize Chrome when finished. Multiple open TV tabs can multiply requests; use one tab.

## Offline behavior

- **App shell:** service worker + Cache Storage; launches locally after one successful online visit and installation.
- **Settings (including API key) and video metadata:** localStorage is the display source of truth. A single snapshot write commits the settings atomically before notifying React. Failed fetches/writes do not replace the current list.
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

UI styles use StyleX compiled at build time. The list uses Material 3 dark surface/type roles and the Android TV focus guidance, implemented with a small shared value file (`src/theme.stylex.ts`), not a component framework or theme engine. Cards keep a preferred width of 284px and 16:9 thumbnails rather than a fixed column count; narrow viewports cap each card at the available row width. Rows scroll horizontally, with the visible card count adapting to the viewport. Desktop gutters are 48px, card gaps 24px, and card text insets 16px. Only the selected card has a white focus ring; no hover decoration or animation is added. References: [Material typography](https://github.com/material-components/material-web/blob/main/docs/theming/typography.md), [TV focus](https://developer.android.com/design/ui/tv/guides/styles/focus-system).

## Deployment

The `Deploy TV` GitHub Actions workflow builds with Bun and publishes `dist` to GitHub Pages on pushes to `main`. Repository **Settings → Pages → Source** must be **GitHub Actions**. The default base path is `/tv/`; if forking, update `src/sync.ts`’s public config URL, the Pages base path in `vite.config.ts`, and your API key’s website restrictions.

Rollback by reverting the relevant commit and pushing normally. The reverted build is delivered as a new service-worker update. Dump your local settings privately before rolling back to an older config-authoritative build; old builds may overwrite the list and may require re-entering the key. Revert public default-config changes similarly. Clearing site data is a last-resort recovery step: it deletes the saved key, lists, and offline copy.

## Validation limits

Automated tests use mocked YouTube responses and an embedded-player placeholder; they do not prove actual YouTube playback, API-key permissions, every video’s compatibility, sustained quota availability, or comfort on a physical TV. Those need a restricted real key and a Mac/HDMI smoke check.

References: [YouTube quotas](https://developers.google.com/youtube/v3/determine_quota_cost), [IFrame Player API](https://developers.google.com/youtube/iframe_api_reference), [YouTube API policies](https://developers.google.com/youtube/terms/developer-policies), [StyleX + Vite](https://stylexjs.com/docs/learn/installation/vite/).
