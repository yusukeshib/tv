import { expect, test, type Page } from "@playwright/test";
import { definitionKey } from "../../src/store";
import type { RowDefinition, Snapshot } from "../../src/types";

// Layout tests need deterministic image interception in both modes. The separate
// production suite covers service-worker caching and update behavior.
test.use({ serviceWorkers: "block" });

async function openMixedCards(page: Page) {
  const counts = [5, 3, 12];
  const definitions: RowDefinition[] = counts.map((_, index) => ({
    id: `row${index}`,
    label: ["ニューヨーク", "日本のニュース", "Many videos"][index],
    type: "channel",
    channelId: `UC${String(index).padStart(22, "0")}`,
  }));
  const titles = [
    "Short",
    "ニューヨークの週末・地下鉄と街歩き🗽 長い日本語タイトル".repeat(4),
    "An English title with several words that wraps over more than two lines ".repeat(
      4,
    ),
    "UnbrokenTitle".repeat(20),
    "Missing thumbnail",
  ];
  const snapshot: Snapshot = {
    version: 1,
    apiKey: "layout-test-key",
    localConfig: true,
    config: { version: 1, rows: definitions },
    rows: Object.fromEntries(
      definitions.map((row, rowIndex) => [
        row.id,
        {
          definitionKey: definitionKey(row),
          updatedAt: Date.now(),
          videos: Array.from({ length: counts[rowIndex] }, (_, index) => ({
            id: `video${rowIndex}${String(index).padStart(5, "0")}`,
            title: titles[index % titles.length],
            channelTitle:
              index % 2
                ? "とても長いチャンネル名・Cheers in New York".repeat(5)
                : "Channel",
            thumbnail: `https://i.ytimg.com/vi/layout-${index % titles.length}/mqdefault.jpg`,
            publishedAt: new Date(Date.now() - index * 3600000).toISOString(),
            viewCount: index % 2 ? 123456789 : 12,
          })),
        },
      ]),
    ),
  };
  // Never use real provider data or a real API key. Vary intrinsic thumbnail ratios,
  // including a failed image, rather than testing only identical 16:9 fixtures.
  await page.route(/^https:\/\//, (route) => {
    const match = route
      .request()
      .url()
      .match(/i\.ytimg\.com\/vi\/layout-(\d)/);
    if (!match || match[1] === "4") return route.abort();
    const [width, height] = [
      [640, 360],
      [480, 360],
      [360, 640],
      [640, 640],
    ][Number(match[1])];
    return route.fulfill({
      headers: { "Access-Control-Allow-Origin": "*" },
      contentType: "image/svg+xml",
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><path fill="#738789" d="M0 0h${width}v${height}H0z"/></svg>`,
    });
  });
  await page.addInitScript((value) => {
    if (!localStorage.getItem("tv.snapshot.v1"))
      localStorage.setItem("tv.snapshot.v1", JSON.stringify(value));
  }, snapshot);
  await page.goto("./");
  await expect(page.locator("[data-row-scroll] > button.rt-Card")).toHaveCount(
    20,
  );
  // Load even the offscreen images before asserting geometry.
  await page.locator(".rt-Card img").evaluateAll(async (images) => {
    await Promise.all(
      images.map(async (element) => {
        const image = element as HTMLImageElement;
        image.loading = "eager";
        await image.decode().catch(() => {});
      }),
    );
  });
  expect(
    await page.locator(".rt-Card img").evaluateAll((images) =>
      images.map((element) => {
        const image = element as HTMLImageElement;
        return [image.naturalWidth, image.naturalHeight];
      }),
    ),
  ).toEqual(
    counts.flatMap((count) =>
      Array.from(
        { length: count },
        (_, index) =>
          [
            [640, 360],
            [480, 360],
            [360, 640],
            [640, 640],
            [0, 0],
          ][index % titles.length],
      ),
    ),
  );
}

for (const width of [1600, 320]) {
  test(`video cards stay uniform with mixed content at ${width}px, including reload`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1080 });
    await openMixedCards(page);
    for (const reload of [false, true]) {
      if (reload) await page.reload();
      const cards = page.locator("[data-row-scroll] > button.rt-Card");
      await expect(cards).toHaveCount(20);
      const expectedWidth = Math.min(284, width - 2 * (width <= 900 ? 24 : 48));
      // Assert every card, not just the first or one row of identical titles.
      await expect
        .poll(() =>
          cards.evaluateAll((elements) =>
            elements.map((card) => ({
              width: Math.round(card.getBoundingClientRect().width),
              shrink: getComputedStyle(card).flexShrink,
            })),
          ),
        )
        .toEqual(
          Array.from({ length: 20 }, () => ({
            width: expectedWidth,
            shrink: "0",
          })),
        );
      const geometry = await cards.evaluateAll((elements) =>
        elements.map((card) => {
          const rect = card.getBoundingClientRect();
          const image = card.querySelector("img")!.getBoundingClientRect();
          return {
            height: rect.height,
            imageWidth: image.width,
            imageHeight: image.height,
          };
        }),
      );
      for (const card of geometry) {
        expect(Math.abs(card.height - geometry[0].height)).toBeLessThan(1);
        expect(Math.abs(card.imageWidth - expectedWidth)).toBeLessThan(1);
        expect(
          Math.abs(card.imageWidth / card.imageHeight - 16 / 9),
        ).toBeLessThan(0.01);
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(width);
      const firstRow = page.locator('[data-row-scroll="row0"]');
      const first = firstRow.getByRole("button").first();
      await first.focus();
      await expect(first).toHaveCSS("outline-width", "6px");
      await page.keyboard.press("ArrowRight");
      await expect(firstRow.getByRole("button").nth(1)).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await expect(
        page.locator('[data-row-scroll="row1"]').getByRole("button").nth(1),
      ).toBeFocused();
      if (!reload)
        await page.screenshot({ path: testInfo.outputPath("mixed-cards.png") });
    }
  });
}
