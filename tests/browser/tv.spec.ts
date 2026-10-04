import { test, expect, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { playerAPIMock } from "./playerMock";

const config = {
  version: 1,
  rows: [
    { id: "news", label: "Japan news", type: "search", query: "Japan news" },
  ],
};
const videos = Array.from({ length: 12 }, (_, i) => ({
  id: { videoId: `video${String(i).padStart(6, "0")}` },
  statistics: { viewCount: "1234567" },
  contentDetails: { duration: "PT10M" },
  snippet: {
    title: `News story ${i + 1}`,
    channelTitle: "News channel",
    publishedAt: new Date(Date.now() - i * 3_600_000).toISOString(),
  },
}));
async function mockNetwork(page: Page, homeConfig: unknown = config) {
  await page.route("https://www.youtube.com/iframe_api", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: playerAPIMock,
    }),
  );
  await page.route("https://raw.githubusercontent.com/**", (route) =>
    route.fulfill({
      headers: { "Access-Control-Allow-Origin": "*" },
      json: homeConfig,
    }),
  );
  await page.route("https://www.googleapis.com/**", (route) => {
    const endpoint = new URL(route.request().url()).pathname.split("/").pop();
    const items =
      endpoint === "channels"
        ? [{ contentDetails: { relatedPlaylists: { uploads: "uploads" } } }]
        : endpoint === "playlistItems"
          ? videos.map((video) => ({
              contentDetails: { videoId: video.id.videoId },
            }))
          : endpoint === "videos"
            ? videos.map((video) => ({
                ...video,
                id: video.id.videoId,
                status: { embeddable: true, privacyStatus: "public" },
              }))
            : videos;
    return route.fulfill({
      headers: { "Access-Control-Allow-Origin": "*" },
      json: { items },
    });
  });
  await page.route("https://i.ytimg.com/**", (route) =>
    route.fulfill({
      headers: { "Access-Control-Allow-Origin": "*" },
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><defs><linearGradient id="a"><stop stop-color="#344559"/><stop offset="1" stop-color="#738789"/></linearGradient></defs><path fill="url(#a)" d="M0 0h640v360H0z"/><circle cx="470" cy="140" r="90" fill="#bdc9bd" opacity=".4"/></svg>',
    }),
  );
  await page.route("https://www.youtube.com/embed/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<html><body style="background:#080808;color:white">Official player placeholder for offline tests</body></html>',
    }),
  );
}
async function openHome(page: Page, homeConfig: unknown = config) {
  await mockNetwork(page, homeConfig);
  await page.addInitScript(() => {
    if (!localStorage.getItem("tv.snapshot.v1"))
      localStorage.setItem(
        "tv.snapshot.v1",
        JSON.stringify({
          version: 1,
          apiKey: "test-browser-key",
          config: { version: 1, rows: [] },
          rows: {},
        }),
      );
  });
  await page.goto("./");
  await expect(
    page.getByRole("button", { name: /News story 1,/ }).first(),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        ),
      );
  });
}
test.beforeEach(async ({ request }) => {
  await request.post("/__test/version?value=base");
});

test("first-run key stays on the device and setup is skipped on reload", async ({
  page,
}) => {
  await mockNetwork(page);
  await page.goto("./");
  await expect(page.getByLabel("API key", { exact: true })).toBeVisible();
  await page.getByLabel("API key", { exact: true }).fill("test-browser-key");
  await page.getByRole("button", { name: /Save and start/ }).click();
  await expect(page.getByRole("heading", { name: "Japan news" })).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("tv.snapshot.v1")!).apiKey,
    ),
  ).toBe("test-browser-key");
  expect(page.url()).not.toContain("test-browser-key");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Japan news" })).toBeVisible();
  await expect(page.getByLabel("API key", { exact: true })).toHaveCount(0);
});

test("keyboard selection plays and returns to the same card; only the settings gear is visible", async ({
  page,
}) => {
  await openHome(page);
  await expect(page.getByRole("search")).toHaveCount(0);
  await expect(
    page.getByText("Settings: Ctrl/Cmd+,", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("1.2M views", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: /News story 1,/ }).focus();
  await page.keyboard.press("ArrowRight");
  const second = page.getByRole("button", { name: /News story 2,/ });
  await expect(second).toBeFocused();
  await expect(second).toHaveCSS("outline-width", "6px");
  await expect(second).toHaveCSS("background-color", "rgb(29, 27, 32)");
  const unselected = page.getByRole("button", { name: /News story 1,/ });
  await expect(unselected).toHaveCSS("outline-style", "none");
  await expect(unselected).toHaveCSS("border-top-width", "1px");
  await expect(unselected).toHaveCSS("border-top-color", "rgb(73, 69, 79)");
  await expect(unselected).toHaveCSS("background-color", "rgb(20, 18, 24)");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/watch\/video000001$/);
  await expect(page.locator("iframe")).toHaveAttribute(
    "src",
    /embed\/video000001\?/,
  );
  const seek = page.getByRole("slider", { name: "Seek" });
  await expect(seek).toBeEnabled();
  await expect(
    page.getByRole("group", { name: "Video information" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: /fullscreen|mute|rewind|forward|pause|^play$/i,
    }),
  ).toHaveCount(0);
  expect(await page.evaluate("window.__playerMock.vars.controls")).toBe(0);
  expect(await page.evaluate("window.__playerMock.vars.fs")).toBe(0);
  await page.keyboard.press("ArrowRight");
  await expect(seek).toHaveValue("45");
  await page.keyboard.press("ArrowLeft");
  await expect(seek).toHaveValue("40");
  await page.keyboard.press("Space");
  expect(await page.evaluate("window.__playerMock.calls.at(-1).command")).toBe(
    "pause",
  );
  await page.keyboard.press("Space");
  expect(await page.evaluate("window.__playerMock.calls.at(-1).command")).toBe(
    "play",
  );
  await page.frameLocator("iframe").locator("body").click();
  await expect(page.getByRole("dialog")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(seek).toHaveValue("45");
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/#\/$/);
  await expect(second).toBeFocused();
  await expect(
    page.getByRole("button", { name: /view all|sort/i }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Settings", exact: true }),
  ).toHaveCount(1);
  await page.screenshot({ path: "test-results/home.png" });
});

test("player: controls auto-hide after three seconds and reappear immediately on keys", async ({
  page,
}) => {
  await openHome(page);
  await page.clock.install();
  await page
    .getByRole("button", { name: /News story 1,/ })
    .first()
    .click();
  const seek = page.getByRole("slider", { name: "Seek" });
  const back = page.getByRole("button", { name: "Back to home" });
  await expect(seek).toBeEnabled();
  await expect(seek).toBeVisible();
  await page.clock.runFor(2_999);
  await expect(seek).toBeVisible();
  await page.clock.runFor(1);
  await expect(seek).toBeHidden();
  await expect(back).toBeHidden();
  await page.keyboard.press("ArrowRight");
  await expect(seek).toBeVisible();
  await expect(back).toBeVisible();
  await expect(seek).toHaveValue("45");
  await page.clock.runFor(2_000);
  await page.keyboard.press("Shift");
  await page.clock.runFor(2_999);
  await expect(seek).toBeVisible();
  await page.clock.runFor(1);
  await expect(seek).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: /News story 1,/ }).first(),
  ).toBeFocused();
});

test("player: seekbar stays above the iframe and supports pointer seeking", async ({
  page,
}) => {
  await openHome(page);
  await page
    .getByRole("button", { name: /News story 1,/ })
    .first()
    .click();
  const seek = page.getByRole("slider", { name: "Seek" });
  await expect(seek).toBeEnabled();
  // The embed must not be able to cover our controls with its own stacking order.
  await page.locator("iframe").evaluate((frame) => {
    frame.style.zIndex = "9999";
  });
  expect(
    await seek.evaluate((input) => {
      const rect = input.getBoundingClientRect();
      return (
        document.elementFromPoint(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
        ) === input
      );
    }),
  ).toBe(true);
  await expect(seek).toHaveCSS("appearance", "none");
  // Played portion (40s of 240s) is drawn as a white bar over a translucent track.
  await expect(seek).toHaveCSS(
    "background-image",
    /rgb\(255, 255, 255\) 16\.66/,
  );
  await seek.screenshot({ path: "test-results/seekbar.png" });
  await expect(page.getByLabel("Playback controls").locator("div")).toHaveCSS(
    "background-color",
    "rgba(12, 12, 16, 0.9)",
  );
  const box = (await seek.boundingBox())!;
  await seek.click({ position: { x: box.width * 0.6, y: box.height / 2 } });
  await expect
    .poll(() =>
      page.evaluate(
        "window.__playerMock.calls.filter(c => c.command === 'seek').at(-1)?.value ?? 0",
      ),
    )
    .toBeGreaterThan(100);
  await page.getByRole("button", { name: "Back to home" }).click();
  await expect(
    page.getByRole("button", { name: /News story 1,/ }).first(),
  ).toBeFocused();
});

test("player: video covers the full viewport with controls overlaid at every aspect ratio", async ({
  page,
}) => {
  await openHome(page);
  await page
    .getByRole("button", { name: /News story 1,/ })
    .first()
    .click();
  const frame = page.locator("iframe");
  await expect(frame).toBeVisible();
  await expect(page.getByRole("slider", { name: "Seek" })).toBeEnabled();
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 2000, height: 700 },
    { width: 900, height: 1200 },
  ]) {
    await page.setViewportSize(viewport);
    const overlay = (await page.getByRole("dialog").boundingBox())!;
    const video = (await frame.boundingBox())!;
    expect(overlay).toEqual({ x: 0, y: 0, ...viewport });
    expect(video.x).toBeLessThanOrEqual(1);
    expect(video.y).toBeLessThanOrEqual(1);
    expect(video.x + video.width).toBeGreaterThanOrEqual(viewport.width - 1);
    expect(video.y + video.height).toBeGreaterThanOrEqual(viewport.height - 1);
    expect(Math.abs(video.width / video.height - 16 / 9)).toBeLessThan(0.001);
    expect(
      Math.abs(video.x + video.width / 2 - viewport.width / 2),
    ).toBeLessThan(1);
    expect(
      Math.abs(video.y + video.height / 2 - viewport.height / 2),
    ).toBeLessThan(1);
    const back = page.getByRole("button", { name: "Back to home" });
    const seek = page.getByRole("slider", { name: "Seek" });
    await expect(back).toBeVisible();
    await expect(seek).toBeVisible();
    const backBox = (await back.boundingBox())!;
    const seekBox = (await seek.boundingBox())!;
    expect(backBox.y).toBeGreaterThanOrEqual(0);
    expect(seekBox.y + seekBox.height).toBeLessThanOrEqual(viewport.height);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByRole("button", { name: "Back to home" }).click();
  await expect(
    page.getByRole("button", { name: /News story 1,/ }).first(),
  ).toBeFocused();
});

test("seek batches arrow repeats, preserves the preview, and cancels on close", async ({
  page,
}) => {
  await openHome(page);
  await page.getByRole("button", { name: /News story 1,/ }).click();
  const seek = page.getByRole("slider", { name: "Seek" });
  await expect(seek).toBeEnabled();
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("ArrowRight");
    await page.clock.runFor(50);
  }
  await expect(seek).toHaveValue("90");
  expect(
    await page.evaluate(
      "window.__playerMock.calls.filter(c => c.command === 'seek')",
    ),
  ).toEqual([]);
  await page.keyboard.press("ArrowLeft");
  await expect(seek).toHaveValue("85");
  await page.keyboard.press("Shift+ArrowRight");
  await expect(seek).toHaveValue("135");
  await page.keyboard.press("Shift+ArrowLeft");
  await expect(seek).toHaveValue("85");
  await page.keyboard.press("Shift+ArrowRight");
  await expect(seek).toHaveValue("135");
  await page.clock.runFor(199);
  expect(
    await page.evaluate(
      "window.__playerMock.calls.filter(c => c.command === 'seek')",
    ),
  ).toEqual([]);
  await page.clock.runFor(1);
  expect(
    await page.evaluate(
      "window.__playerMock.calls.filter(c => c.command === 'seek').at(-1).value",
    ),
  ).toBe(135);
  expect(
    await page.evaluate(
      "window.__playerMock.calls.filter(c => c.command === 'seek').length",
    ),
  ).toBe(1);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Escape");
  await page.clock.runFor(500);
  expect(
    await page.evaluate(
      "window.__playerMock.calls.filter(c => c.command === 'seek').length",
    ),
  ).toBe(1);
});

test("cached app, config, and lists survive an offline reload", async ({
  page,
  context,
}) => {
  await openHome(page);
  await page.unrouteAll({ behavior: "wait" });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Japan news" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /News story 1,/ }),
  ).toBeVisible();
  await expect(page.getByLabel("API key", { exact: true })).toHaveCount(0);
});

test("HTML-only update is installed then reloaded without losing data or selection", async ({
  page,
  request,
}) => {
  await openHome(page);
  await page.getByRole("button", { name: /News story 4,/ }).focus();
  await request.post("/__test/version?value=next");
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration?.update();
  });
  await expect(page).toHaveTitle("TV updated");
  await expect(
    page.getByRole("button", { name: /News story 4,/ }),
  ).toBeFocused();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("tv.snapshot.v1")!).apiKey,
    ),
  ).toBe("test-browser-key");
});

test("an incomplete app update retains the offline-capable previous version", async ({
  page,
  request,
  context,
}) => {
  await openHome(page);
  await request.post("/__test/version?value=broken");
  const state = await page.evaluate(async () => {
    const registration = (await navigator.serviceWorker.getRegistration())!;
    const completion = new Promise<string>((resolve) => {
      registration.addEventListener(
        "updatefound",
        () => {
          const worker = registration.installing!;
          worker.addEventListener("statechange", () => {
            if (worker.state === "redundant" || worker.state === "installed")
              resolve(worker.state);
          });
        },
        { once: true },
      );
    });
    await registration.update();
    return completion;
  });
  expect(state).toBe("redundant");
  await page.unrouteAll({ behavior: "wait" });
  await context.setOffline(true);
  await page.reload();
  await expect(page).toHaveTitle("TV");
  await expect(page.getByRole("heading", { name: "Japan news" })).toBeVisible();
});

test("app updates wait for playback to close, then reload exactly once", async ({
  page,
  request,
}) => {
  await openHome(page);
  await page.getByRole("button", { name: /News story 1,/ }).click();
  let navigations = 0;
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigations++;
  });
  await request.post("/__test/version?value=next");
  await page.evaluate(async () => {
    const registration = (await navigator.serviceWorker.getRegistration())!;
    await registration.update();
  });
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          !!(await navigator.serviceWorker.getRegistration())?.waiting,
      ),
    )
    .toBe(true);
  await expect(page.locator("iframe")).toBeVisible();
  await expect(page).toHaveTitle("TV");
  expect(navigations).toBe(0);
  await page.getByRole("button", { name: "Back to home" }).click();
  await expect(page).toHaveTitle("TV updated");
  expect(navigations).toBe(1);
});

for (const selectedRow of ["row0", "row1"]) {
  test(`returning from playback preserves vertical and every row's horizontal scroll (${selectedRow})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    await openHome(page, {
      version: 1,
      rows: Array.from({ length: 4 }, (_, i) => ({
        id: `row${i}`,
        label: `Row ${i}`,
        type: "search",
        query: `row ${i}`,
      })),
    });
    const selected = page
      .locator(`[data-row-scroll="${selectedRow}"]`)
      .getByRole("button")
      .nth(6);
    await selected.evaluate((node) => node.focus({ preventScroll: true }));
    const before = await page.evaluate(() => {
      const tracks = [
        ...document.querySelectorAll<HTMLElement>("[data-row-scroll]"),
      ];
      tracks.forEach((track, index) => {
        track.scrollLeft = 350 + index * 100;
      });
      window.scrollTo(0, 300);
      return {
        top: window.scrollY,
        tracks: tracks.map((track) => track.scrollLeft),
      };
    });
    await page.keyboard.press("Enter");
    await expect(page.locator("iframe")).toBeVisible();
    await expect(page).toHaveURL(/#\/watch\/video000006$/);
    await page.goBack();
    await expect(selected).toBeFocused();
    await expect
      .poll(() =>
        page.evaluate(() => ({
          top: window.scrollY,
          tracks: [
            ...document.querySelectorAll<HTMLElement>("[data-row-scroll]"),
          ].map((track) => track.scrollLeft),
        })),
      )
      .toEqual(before);
    await page.goForward();
    await expect(page.locator("iframe")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(selected).toBeFocused();
    await expect
      .poll(() =>
        page.evaluate(() => ({
          top: window.scrollY,
          tracks: [
            ...document.querySelectorAll<HTMLElement>("[data-row-scroll]"),
          ].map((track) => track.scrollLeft),
        })),
      )
      .toEqual(before);
  });
}

test("keyboard scroll policy keeps axes separate and top row at zero", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await openHome(page, {
    version: 1,
    rows: Array.from({ length: 4 }, (_, i) => ({
      id: `row${i}`,
      label: `Row ${i}`,
      type: "search",
      query: `row ${i}`,
    })),
  });
  const top = page.locator('[data-row-scroll="row0"]');
  await top.getByRole("button").first().focus();
  const beforeHorizontal = await page.evaluate(() => window.scrollY);
  for (let i = 0; i < 7; i++) await page.keyboard.press("ArrowRight");
  expect(await page.evaluate(() => window.scrollY)).toBe(beforeHorizontal);
  const topHorizontal = await top.evaluate((node) => node.scrollLeft);
  expect(topHorizontal).toBeGreaterThan(0);
  await page.keyboard.press("ArrowDown");
  const second = page.locator('[data-row-scroll="row1"]');
  await expect(second.getByRole("button").nth(7)).toBeFocused();
  const geometry = await second.evaluate((track) => {
    const section = track.closest("section")!.getBoundingClientRect();
    const card = track.querySelectorAll("button")[7].getBoundingClientRect();
    const rect = track.getBoundingClientRect();
    return {
      top: section.top,
      bottom: section.bottom,
      viewport: innerHeight,
      cardLeft: card.left,
      cardRight: card.right,
      trackLeft: rect.left,
      trackRight: rect.right,
      padding: parseFloat(getComputedStyle(track).paddingTop),
    };
  });
  expect(geometry.top).toBeGreaterThanOrEqual(geometry.padding - 1);
  expect(geometry.bottom).toBeLessThanOrEqual(
    geometry.viewport - geometry.padding + 1,
  );
  expect(geometry.cardLeft).toBeGreaterThanOrEqual(
    geometry.trackLeft + geometry.padding - 1,
  );
  expect(geometry.cardRight).toBeLessThanOrEqual(
    geometry.trackRight - geometry.padding + 1,
  );
  expect(await top.evaluate((node) => node.scrollLeft)).toBe(topHorizontal);
  const secondVertical = await page.evaluate(() => window.scrollY);
  await page.keyboard.press("ArrowRight");
  expect(await page.evaluate(() => window.scrollY)).toBe(secondVertical);
  await page.keyboard.press("ArrowLeft");
  const secondHorizontal = await second.evaluate((node) => node.scrollLeft);
  await page.keyboard.press("ArrowUp");
  await expect(top.getByRole("button").nth(7)).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(await top.evaluate((node) => node.scrollLeft)).toBe(topHorizontal);
  expect(await second.evaluate((node) => node.scrollLeft)).toBe(
    secondHorizontal,
  );
  await page.evaluate(() => window.scrollTo(0, 100));
  await page.keyboard.press("ArrowRight");
  expect(await page.evaluate(() => window.scrollY)).toBe(100);
  await page.keyboard.press("ArrowUp");
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("manual scroll and selection survive background video refresh", async ({
  page,
}) => {
  await page.clock.install();
  await page.setViewportSize({ width: 1280, height: 600 });
  await openHome(page, {
    version: 1,
    rows: [
      ...config.rows,
      { id: "other", label: "Other news", type: "search", query: "other" },
    ],
  });
  const selected = page
    .locator('[data-row-scroll="news"]')
    .getByRole("button", { name: /News story 7,/ });
  await selected.evaluate((node) => node.focus({ preventScroll: true }));
  const track = page.locator('[data-row-scroll="news"]');
  await track.evaluate((node) => {
    node.scrollLeft = 200;
  });
  await page.evaluate(() => window.scrollTo(0, 100));
  await page.route("https://www.googleapis.com/**", (route) =>
    route.fulfill({
      headers: { "Access-Control-Allow-Origin": "*" },
      json: {
        items: [
          {
            ...videos[0],
            id: { videoId: "newvideo000" },
            snippet: {
              ...videos[0].snippet,
              title: "New story",
              publishedAt: new Date(Date.now() + 3600000).toISOString(),
            },
          },
          ...videos,
        ],
      },
    }),
  );
  await page.clock.setSystemTime(new Date(Date.now() + 610000));
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(track.getByRole("button", { name: /New story,/ })).toHaveCount(
    1,
  );
  await expect(selected).toBeFocused();
  expect(await track.evaluate((node) => node.scrollLeft)).toBe(200);
  expect(await page.evaluate(() => window.scrollY)).toBe(100);
  await page.reload();
  await expect(selected).toBeFocused();
  expect(await track.evaluate((node) => node.scrollLeft)).toBe(200);
  expect(await page.evaluate(() => window.scrollY)).toBe(100);
});

test("cached watch URL survives reload", async ({ page }) => {
  await openHome(page);
  await page.getByRole("button", { name: /News story 1,/ }).click();
  await expect(page).toHaveURL(/#\/watch\/video000000$/);
  await expect(page.locator("iframe")).toBeVisible();
  await page.reload();
  await expect(page.locator("iframe")).toBeVisible();
  await expect(page).toHaveURL(/#\/watch\/video000000$/);
  await page.getByRole("button", { name: "Back to home" }).click();
  await expect(
    page.getByRole("button", { name: /News story 1,/ }),
  ).toBeFocused();
});

test("unavailable watch and unknown routes offer Home", async ({ page }) => {
  await openHome(page);
  await page.goto("./#/watch/missingvideo");
  await expect(page.getByRole("status")).toHaveText(
    "This video is not available in your saved library.",
  );
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.getByRole("link", { name: "Back to home" }).click();
  await expect(
    page.getByRole("button", { name: /News story 1,/ }),
  ).toBeVisible();
  await page.goto("./#/unknown");
  await expect(page.getByText("Page not found.")).toBeVisible();
  await page.getByRole("link", { name: "Back to home" }).click();
  await expect(page).toHaveURL(/#\/$/);
});

test("new and legacy setup routes remain available", async ({ page }) => {
  await openHome(page);
  for (const hash of ["#/setup", "#setup"]) {
    await page.goto(`./${hash}`);
    await expect(page.getByRole("button", { name: /save/i })).toBeVisible();
    await page.getByRole("button", { name: /save/i }).click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByRole("button", { name: /News story 1,/ }),
    ).toBeVisible();
  }
});

test("responsive rows preserve card size and fit as many cards as the viewport allows", async ({
  page,
}) => {
  await openHome(page);
  await expect(page.getByText("TV YouTube", { exact: true })).toHaveCount(0);
  for (const width of [2560, 1920, 1786, 1280, 900, 600, 320]) {
    await page.setViewportSize({ width, height: 1080 });
    const track = page.locator('[data-row-scroll="news"]');
    const cards = track.getByRole("button");
    await cards.first().focus();
    const heading = await page
      .getByRole("heading", { name: "Japan news" })
      .boundingBox();
    const first = (await cards.nth(0).boundingBox())!;
    const gutter = width <= 900 ? 24 : 48;
    const gap = width <= 900 ? 16 : 24;
    const available = width - 2 * gutter;
    const cardWidth = Math.min(284, available);
    const visibleCount = Math.floor((available + gap) / (cardWidth + gap));
    const lastVisible = (await cards.nth(visibleCount - 1).boundingBox())!;
    const next = (await cards.nth(visibleCount).boundingBox())!;
    expect(Math.abs(first.width - cardWidth)).toBeLessThan(1);
    const image = (await cards.first().locator("img").boundingBox())!;
    expect(Math.abs(image.width / image.height - 16 / 9)).toBeLessThan(0.01);
    const bounds = (await track.boundingBox())!;
    expect(Math.abs(first.x - heading!.x)).toBeLessThan(2);
    expect(first.x - 8).toBeGreaterThanOrEqual(bounds.x);
    expect(lastVisible.x + lastVisible.width + 8).toBeLessThanOrEqual(
      bounds.x + bounds.width + 1,
    );
    expect(next.x + next.width).toBeGreaterThan(first.x + available);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
    await expect(cards.first()).toHaveCSS("outline-width", "6px");
    await expect(cards.first()).toHaveCSS(
      "outline-color",
      "rgb(255, 255, 255)",
    );
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await cards.first().focus();
    const restored = (await cards.first().boundingBox())!;
    expect(Math.abs(restored.x - heading!.x)).toBeLessThan(2);
  }
  await page.setViewportSize({ width: 1786, height: 1080 });
  await page.screenshot({ path: "test-results/compact-home.png" });
});

async function openSettings(page: Page) {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
}

async function savedSettings(page: Page) {
  return page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("tv.snapshot.v1")!);
    return {
      apiKey: saved.apiKey,
      config: saved.config,
      localConfig: saved.localConfig,
    };
  });
}

async function loadSettingsJSON(page: Page, data: unknown) {
  await page.getByLabel("Load settings JSON").setInputFiles({
    name: "settings.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(data)),
  });
}

test("settings: Home has only a gear; Cancel discards edits and restores gear focus", async ({
  page,
}) => {
  await openHome(page);
  await expect(
    page.getByRole("button", { name: "Settings", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: /Add search|Load JSON|Dump JSON|Delete/ }),
  ).toHaveCount(0);
  const before = await savedSettings(page);
  await openSettings(page);
  await expect(page.getByLabel("API key", { exact: true })).toBeFocused();
  await page.getByLabel("Label", { exact: true }).fill("Unsaved label");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Japan news" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Settings", exact: true }),
  ).toBeFocused();
  expect(await savedSettings(page)).toEqual(before);
});

test("settings: all search defaults seed a new saved row and persist with the key", async ({
  page,
}) => {
  await openHome(page);
  const searches: URL[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      url.hostname === "www.googleapis.com" &&
      url.pathname.endsWith("/search")
    )
      searches.push(url);
  });
  await openSettings(page);
  const defaults = page.getByRole("group", {
    name: "Search defaults",
    exact: true,
  });
  await defaults.getByLabel("Candidate order").selectOption("viewCount");
  await defaults.getByLabel("Time range").selectOption("7d");
  await defaults.getByLabel("Language preference").fill("ja");
  await defaults.getByLabel("Region", { exact: true }).fill("JP");
  await defaults.getByLabel("Results per page").fill("50");
  await defaults.getByLabel("Minimum duration (seconds)").fill("0");
  await page
    .getByLabel("API key", { exact: true })
    .fill("replacement-browser-key");
  await page.getByRole("button", { name: "Add search", exact: true }).click();
  const added = page.getByRole("group", { name: "2. New search", exact: true });
  await expect(added.getByLabel("Candidate order")).toHaveValue("viewCount");
  await expect(added.getByLabel("Time range")).toHaveValue("7d");
  await expect(added.getByLabel("Language preference")).toHaveValue("ja");
  await expect(added.getByLabel("Region", { exact: true })).toHaveValue("JP");
  await expect(added.getByLabel("Results per page")).toHaveValue("50");
  await expect(added.getByLabel("Minimum duration (seconds)")).toHaveValue("0");
  await added.getByLabel("Search query").fill("space news");
  await added.getByLabel("Label", { exact: true }).fill("Space");
  expect(searches).toHaveLength(0);
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Space", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      searches
        .find((url) => url.searchParams.get("q") === "space news")
        ?.searchParams.get("order"),
    )
    .toBe("viewCount");
  const params = searches.find(
    (url) => url.searchParams.get("q") === "space news",
  )!.searchParams;
  expect(params.get("relevanceLanguage")).toBe("ja");
  expect(params.get("regionCode")).toBe("JP");
  expect(params.get("maxResults")).toBe("50");
  expect(params.get("publishedAfter")).toBeTruthy();
  expect(params.get("key")).toBe("replacement-browser-key");
  const before = await savedSettings(page);
  expect(before.config.rows[1].search).toMatchObject({
    query: "space news",
    minDurationSeconds: 0,
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Space", exact: true }),
  ).toBeVisible();
  expect(await savedSettings(page)).toEqual(before);
  await openSettings(page);
  await expect(
    page
      .getByRole("group", { name: "Search defaults", exact: true })
      .getByLabel("Candidate order"),
  ).toHaveValue("viewCount");
});

test("settings: default search and channel rows can all be deleted without returning", async ({
  page,
}) => {
  await openHome(page, {
    version: 1,
    rows: [
      ...config.rows,
      {
        id: "bbc",
        label: "BBC News",
        type: "channel",
        channelId: "UC16niRr50-MSBwiO3YDb3RA",
      },
    ],
  });
  await expect(
    page.getByRole("heading", { name: "BBC News", exact: true }),
  ).toBeVisible();
  await openSettings(page);
  await page
    .getByRole("button", { name: "Delete Japan news", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete BBC News", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(
    page.getByText("Open Settings to add a search or channel."),
  ).toBeVisible();
  let remoteReads = 0;
  page.on("request", (request) => {
    if (request.url().startsWith("https://raw.githubusercontent.com/"))
      remoteReads++;
  });
  await page.reload();
  await expect(
    page.getByText("Open Settings to add a search or channel."),
  ).toBeVisible();
  expect(remoteReads).toBe(0);
  expect((await savedSettings(page)).config.rows).toEqual([]);
  await openSettings(page);
  await expect(page.getByText("Your Home list is empty.")).toBeVisible();
});

test("settings: Dump and Load round-trip all settings including the secret key on a fresh device", async ({
  page,
}) => {
  await openHome(page);
  await openSettings(page);
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Dump JSON", exact: true }).click();
  const download = await downloadEvent;
  const dumped = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(Object.keys(dumped).sort()).toEqual([
    "apiKey",
    "rows",
    "searchDefaults",
    "version",
  ]);
  expect(dumped.apiKey).toBe("test-browser-key");
  expect(dumped.rows[0].search.query).toBe("Japan news");
  expect(dumped.searchDefaults).toEqual({
    order: "relevance",
    timeRange: "all",
    maxResults: 25,
    minDurationSeconds: 240,
  });
  const freshContext = await page.context().browser()!.newContext();
  try {
    const fresh = await freshContext.newPage();
    await mockNetwork(fresh);
    await fresh.goto(page.url().split("#")[0]);
    await expect(
      fresh.getByRole("button", { name: "Open settings / Load JSON" }),
    ).toBeVisible();
    await fresh
      .getByRole("button", { name: "Open settings / Load JSON" })
      .click();
    await loadSettingsJSON(fresh, dumped);
    await expect(fresh.getByRole("status")).toContainText(
      "Loaded settings into the editor",
    );
    await expect(fresh.getByLabel("API key", { exact: true })).toHaveValue(
      "test-browser-key",
    );
    await fresh
      .getByRole("button", { name: "Save settings", exact: true })
      .click();
    await expect(
      fresh.getByRole("heading", { name: "Japan news" }),
    ).toBeVisible();
    const saved = await savedSettings(fresh);
    expect({ ...saved.config, apiKey: saved.apiKey }).toEqual(dumped);
  } finally {
    await freshContext.close();
  }
});

test("settings: invalid Load preserves the draft; valid Load can be cancelled without replacing saved settings", async ({
  page,
}) => {
  await openHome(page);
  const before = await savedSettings(page);
  await openSettings(page);
  await page.getByLabel("Label", { exact: true }).fill("Unsaved label");
  const imported = {
    ...before.config,
    apiKey: "imported-key",
    searchDefaults: {
      order: "date",
      timeRange: "all",
      maxResults: 10,
      minDurationSeconds: 0,
    },
    rows: [],
  };
  await loadSettingsJSON(page, {
    ...imported,
    rows: [before.config.rows[0], before.config.rows[0]],
  });
  await expect(page.getByRole("alert")).toContainText("unique ID");
  await expect(page.getByLabel("Label", { exact: true })).toHaveValue(
    "Unsaved label",
  );
  expect(await savedSettings(page)).toEqual(before);
  await loadSettingsJSON(page, imported);
  await expect(page.getByRole("status")).toContainText("Loaded settings");
  await expect(page.getByLabel("API key", { exact: true })).toHaveValue(
    "imported-key",
  );
  await expect(page.getByText("Your Home list is empty.")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Japan news" })).toBeVisible();
  expect(await savedSettings(page)).toEqual(before);
});

test("settings: failed saves leave the saved key and list intact", async ({
  page,
}) => {
  await openHome(page);
  const before = await savedSettings(page);
  await openSettings(page);
  await page.getByLabel("API key", { exact: true }).fill("unsaved-key");
  await page.getByLabel("Search query").fill("unsaved query");
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "tv.snapshot.v1") throw new Error("storage full");
      setItem.call(this, key, value);
    };
  });
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Cannot save on this device",
  );
  expect(await savedSettings(page)).toEqual(before);
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
});

test("settings: reordered rows persist on Home and in JSON without refetching their caches", async ({
  page,
}) => {
  await openHome(page, {
    version: 1,
    rows: [
      ...config.rows,
      { ...config.rows[0], id: "space", label: "Space", query: "Space" },
      {
        id: "bbc",
        label: "BBC News",
        type: "channel",
        channelId: "UC16niRr50-MSBwiO3YDb3RA",
      },
    ],
  });
  await expect(
    page.locator('[data-row-scroll="bbc"]').getByRole("button").first(),
  ).toBeVisible();
  const cached = await page.evaluate(
    () => JSON.parse(localStorage.getItem("tv.snapshot.v1")!).rows,
  );
  await openSettings(page);
  await expect(
    page.getByRole("button", { name: "Move Japan news up", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Move BBC News down", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Move Space up", exact: true })
    .click();
  await expect(
    page.getByRole("group", { name: "1. Space", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Move Space down", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Move BBC News up", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Move BBC News up", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Move BBC News up", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Move Space down", exact: true }),
  ).toBeDisabled();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Dump JSON", exact: true }).click();
  const download = await downloadEvent;
  const dumped = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(dumped.rows.map((row: { id: string }) => row.id)).toEqual([
    "bbc",
    "news",
    "space",
  ]);
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/$/);
  expect(
    await page
      .locator("[data-row-scroll]")
      .evaluateAll((tracks) =>
        tracks.map((track) => track.getAttribute("data-row-scroll")),
      ),
  ).toEqual(["bbc", "news", "space"]);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("tv.snapshot.v1")!).rows,
    ),
  ).toEqual(cached);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "BBC News", exact: true }),
  ).toBeVisible();
  expect(
    (await savedSettings(page)).config.rows.map(
      (row: { id: string }) => row.id,
    ),
  ).toEqual(["bbc", "news", "space"]);
  await openSettings(page);
  await expect(
    page.getByRole("group", { name: "1. BBC News", exact: true }),
  ).toBeVisible();
  await loadSettingsJSON(page, { ...dumped, rows: [...dumped.rows].reverse() });
  await expect(page.getByRole("status")).toContainText("Loaded settings");
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/$/);
  expect(
    (await savedSettings(page)).config.rows.map(
      (row: { id: string }) => row.id,
    ),
  ).toEqual(["space", "news", "bbc"]);
});

test("settings: Cancel leaves the saved row order unchanged", async ({
  page,
}) => {
  await openHome(page, {
    version: 1,
    rows: [
      ...config.rows,
      { ...config.rows[0], id: "space", label: "Space", query: "Space" },
    ],
  });
  const before = await savedSettings(page);
  await openSettings(page);
  await page
    .getByRole("button", { name: "Move Japan news down", exact: true })
    .click();
  await expect(
    page.getByRole("group", { name: "1. Space", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page).toHaveURL(/#\/$/);
  expect(await savedSettings(page)).toEqual(before);
  expect(
    await page
      .locator("[data-row-scroll]")
      .evaluateAll((tracks) =>
        tracks.map((track) => track.getAttribute("data-row-scroll")),
      ),
  ).toEqual(["news", "space"]);
});

test("settings: editing an existing search replaces its conditions while Home playback still works", async ({
  page,
}) => {
  await openHome(page);
  await openSettings(page);
  const row = page.getByRole("group", { name: "1. Japan news", exact: true });
  await row.getByLabel("Search query").fill("edited search");
  await row.getByLabel("Candidate order").selectOption("date");
  await row.getByLabel("Minimum duration (seconds)").fill("600");
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /News story 1,/ }).first(),
  ).toBeVisible();
  const saved = await savedSettings(page);
  expect(saved.config.rows[0].search).toMatchObject({
    query: "edited search",
    order: "date",
    minDurationSeconds: 600,
  });
  await page
    .getByRole("button", { name: /News story 1,/ })
    .first()
    .click();
  await expect(page.locator("iframe")).toHaveAttribute(
    "src",
    /embed\/video000000\?/,
  );
  await page.getByRole("button", { name: "Back to home" }).click();
  await expect(
    page.getByRole("button", { name: /News story 1,/ }).first(),
  ).toBeFocused();
});

async function tabTo(page: Page, target: Locator) {
  for (let count = 0; count < 100; count++) {
    if (await target.evaluate((node) => node === document.activeElement))
      return;
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}

async function replaceByKeyboard(page: Page, value: string) {
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(value);
}

async function keyboardSettings(page: Page, shortcut = "Control+,") {
  await page.keyboard.press(shortcut);
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(page.getByLabel("API key", { exact: true })).toBeFocused();
}

test("keyboard-only: settings shortcut preserves draft, selection and scroll; Escape cancels", async ({
  page,
}) => {
  await openHome(page);
  for (let index = 0; index < 8; index++)
    await page.keyboard.press("ArrowRight");
  const selected = page.getByRole("button", { name: /News story 9,/ });
  await expect(selected).toBeFocused();
  const track = page.locator('[data-row-scroll="news"]');
  const scroll = await track.evaluate((node) => node.scrollLeft);
  const before = await savedSettings(page);
  await keyboardSettings(page);
  await replaceByKeyboard(page, "unsaved-key");
  await page.keyboard.press("Control+,");
  await expect(page.getByLabel("API key", { exact: true })).toHaveValue(
    "unsaved-key",
  );
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/#\/$/);
  await expect(selected).toBeFocused();
  expect(await track.evaluate((node) => node.scrollLeft)).toBe(scroll);
  expect(await savedSettings(page)).toEqual(before);
});

for (const modifier of ["Control", "Meta"]) {
  test(`keyboard-only: ${modifier} shortcuts save edits through the existing settings form`, async ({
    page,
  }) => {
    await openHome(page);
    await keyboardSettings(page, `${modifier}+,`);
    await tabTo(page, page.getByLabel("Label", { exact: true }));
    await replaceByKeyboard(page, "Keyboard news");
    await page.keyboard.press(`${modifier}+s`);
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByRole("heading", { name: "Keyboard news" }),
    ).toBeVisible();
    expect((await savedSettings(page)).config.rows[0].label).toBe(
      "Keyboard news",
    );
  });
}

test("keyboard-only: save validates required input and ignores composition shortcuts", async ({
  page,
}) => {
  await openHome(page);
  const before = await savedSettings(page);
  await keyboardSettings(page);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Control+s");
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(page.getByLabel("API key", { exact: true })).toBeFocused();
  expect(await savedSettings(page)).toEqual(before);
  await page.keyboard.insertText("restored-key");
  await page.evaluate(() => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        isComposing: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(page).toHaveURL(/#\/settings$/);
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: ",",
        ctrlKey: true,
        isComposing: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(page).toHaveURL(/#\/$/);
});

test("keyboard-only: first-time setup can open settings and save without a mouse", async ({
  page,
}) => {
  await mockNetwork(page);
  await page.goto("./");
  await keyboardSettings(page);
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("API key", { exact: true })).toBeFocused();
  await page.keyboard.insertText("keyboard-setup-key");
  await tabTo(
    page,
    page.getByRole("button", { name: "Open settings / Load JSON" }),
  );
  await page.keyboard.press("Control+s");
  await expect(page.getByRole("heading", { name: "Japan news" })).toBeVisible();
  expect((await savedSettings(page)).apiKey).toBe("keyboard-setup-key");
  await page.goto("./#/setup");
  await expect(page.getByLabel("API key", { exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole("heading", { name: "Japan news" })).toBeVisible();
});

test("keyboard-only: adding, moving and deleting rows keeps meaningful focus", async ({
  page,
}) => {
  await openHome(page);
  await keyboardSettings(page);
  await tabTo(
    page,
    page.getByRole("button", { name: "Add channel", exact: true }),
  );
  await page.keyboard.press("Enter");
  const added = page.getByRole("group", {
    name: "2. New channel",
    exact: true,
  });
  await expect(added.getByLabel("Label", { exact: true })).toBeFocused();
  await replaceByKeyboard(page, "Keyboard channel");
  await tabTo(
    page,
    page.getByRole("button", { name: "Move Keyboard channel up", exact: true }),
  );
  await page.keyboard.press("Space");
  const moved = page.getByRole("group", {
    name: "1. Keyboard channel",
    exact: true,
  });
  await expect(moved.getByLabel("Label", { exact: true })).toBeFocused();
  await tabTo(
    page,
    page.getByRole("button", { name: "Delete Keyboard channel", exact: true }),
  );
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Label", { exact: true })).toBeFocused();
  await tabTo(
    page,
    page.getByRole("button", { name: "Delete Japan news", exact: true }),
  );
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Add search", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Japan news" })).toBeVisible();
});

test("keyboard-only: JSON buttons can dump and open a load dialog", async ({
  page,
}) => {
  await openHome(page);
  await keyboardSettings(page);
  await tabTo(
    page,
    page.getByRole("button", { name: "Dump JSON", exact: true }),
  );
  const downloaded = page.waitForEvent("download");
  await page.keyboard.press("Enter");
  const download = await downloaded;
  const dumped = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(dumped.apiKey).toBe("test-browser-key");
  await page.keyboard.press("Shift+Tab");
  await expect(
    page.getByRole("button", { name: "Load JSON", exact: true }),
  ).toBeFocused();
  const choosing = page.waitForEvent("filechooser");
  await page.keyboard.press("Space");
  const chooser = await choosing;
  await chooser.setFiles({
    name: "keyboard-settings.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(dumped)),
  });
  await expect(page.getByRole("status")).toContainText(
    "Loaded settings into the editor",
  );
  await page.keyboard.press("Control+s");
  await expect(page).toHaveURL(/#\/$/);
});

test("keyboard-only: player controls and settings remain accessible", async ({
  page,
}) => {
  await openHome(page);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("slider", { name: "Seek" })).toBeEnabled();
  await page.keyboard.press("Space");
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).__playerMock.calls.some(
          (call: any) => call.command === "pause",
        ),
      ),
    )
    .toBe(true);
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Back to home" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("slider", { name: "Seek" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("slider", { name: "Seek" })).toHaveValue("41");
  await keyboardSettings(page);
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/#\/$/);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("slider", { name: "Seek" })).toBeEnabled();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Space");
  await expect(page).toHaveURL(/#\/$/);
});

test("keyboard-only: player Retry activates with Space instead of toggling playback", async ({
  page,
}) => {
  await openHome(page);
  await page.route("https://www.youtube.com/iframe_api", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: playerAPIMock.replace(
        "options.events.onReady({ target: this })",
        "options.events.onError({ data: 100 })",
      ),
    }),
  );
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Retry", exact: true }),
  ).toBeVisible();
  await tabTo(page, page.getByRole("button", { name: "Retry", exact: true }));
  await page.keyboard.press("Space");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).__playerMock.calls.filter(
            (call: any) => call.command === "destroy",
          ).length,
      ),
    )
    .toBe(1);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/#\/$/);
});
