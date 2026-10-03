import { test, expect, type Page } from "@playwright/test";
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
async function mockNetwork(page: Page, homeConfig = config) {
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
  await page.route("https://www.googleapis.com/**", (route) =>
    route.fulfill({
      headers: { "Access-Control-Allow-Origin": "*" },
      json: { items: videos },
    }),
  );
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
async function openHome(page: Page, homeConfig = config) {
  await mockNetwork(page, homeConfig);
  await page.addInitScript(() => {
    if (!localStorage.getItem("tv.youtube-key"))
      localStorage.setItem("tv.youtube-key", "test-browser-key");
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
    await page.evaluate(() => localStorage.getItem("tv.youtube-key")),
  ).toBe("test-browser-key");
  expect(page.url()).not.toContain("test-browser-key");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Japan news" })).toBeVisible();
  await expect(page.getByLabel("API key", { exact: true })).toHaveCount(0);
});

test("keyboard selection plays and returns to the same card; no management controls", async ({
  page,
}) => {
  await openHome(page);
  await expect(page.getByRole("search")).toHaveCount(0);
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
    page.getByRole("button", { name: /settings|view all|sort/i }),
  ).toHaveCount(0);
  await page.screenshot({ path: "test-results/home.png" });
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
    await page.evaluate(() => localStorage.getItem("tv.youtube-key")),
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

test("compact rows keep five cards visible and the selected ring inside the gutter", async ({
  page,
}) => {
  await openHome(page);
  await expect(page.getByText("TV YouTube", { exact: true })).toHaveCount(0);
  for (const width of [1920, 1786, 1280]) {
    await page.setViewportSize({ width, height: 1080 });
    const track = page.locator('[data-row-scroll="news"]');
    const cards = track.getByRole("button");
    await cards.first().focus();
    const heading = await page
      .getByRole("heading", { name: "Japan news" })
      .boundingBox();
    const first = (await cards.nth(0).boundingBox())!;
    const fifth = (await cards.nth(4).boundingBox())!;
    const bounds = (await track.boundingBox())!;
    expect(Math.abs(first.x - heading!.x)).toBeLessThan(2);
    expect(first.x - 8).toBeGreaterThanOrEqual(bounds.x);
    expect(fifth.x + fifth.width + 8).toBeLessThanOrEqual(
      bounds.x + bounds.width + 1,
    );
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
