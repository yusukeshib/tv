# TV

A YouTube interface for a Mac connected to a TV. No backend.

**Open:** https://yusukeshib.github.io/tv/

## Setup

1. Enable **YouTube Data API v3** in [Google Cloud](https://console.cloud.google.com/) and create a browser API key.
2. Restrict the key to **YouTube Data API v3** and your website: `https://yusukeshib.github.io/*`, or `http://localhost:5173/*` for local development.
3. Open the app and enter the key.

Use a dedicated, restricted key. Browser storage is not a secret vault, and exported settings include the key. Do not commit or publicly share either.

## Development

Use the Bun version specified in [`package.json`](package.json).

```sh
bun install --frozen-lockfile
bun run dev
# http://localhost:5173/tv/
```

## Checks

```sh
bun run test
bun run build
bunx playwright install chromium
bun run test:browser
bun run format:check
```

Use `bun run test`, not `bun test`. Browser tests require the production build and Chromium. YouTube responses are mocked; check real playback manually.

## Deployment

Push to `main` to deploy to GitHub Pages via [GitHub Actions](.github/workflows/deploy.yml). Set **Settings → Pages → Source** to **GitHub Actions**.
