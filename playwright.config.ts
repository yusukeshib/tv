import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:4173/tv/",
    viewport: { width: 1920, height: 1080 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "bun tests/server.mjs",
    url: "http://127.0.0.1:4173/tv/",
    reuseExistingServer: false,
  },
});
