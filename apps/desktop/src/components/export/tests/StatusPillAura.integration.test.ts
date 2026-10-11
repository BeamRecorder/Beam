// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createExportBrowserHarness } from './export-dialog-browser-harness';

describe.runIf(process.env.BEAM_HEADLESS_TEST === '1')('visible completion aura in hidden Chromium', () => {
  let harness: Awaited<ReturnType<typeof createExportBrowserHarness>>;
  beforeAll(async () => {
    harness = await createExportBrowserHarness();
  }, 30_000);
  afterAll(async () => {
    await harness?.dispose();
  });

  it.each([
    { theme: 'light', reduced: false },
    { theme: 'dark', reduced: false },
    { theme: 'light', reduced: true },
    { theme: 'dark', reduced: true },
  ])(
    'draws a visible green outline on every edge in $theme mode (reduced motion: $reduced)',
    async ({ theme, reduced }) => {
      const { page, origin } = harness;
      await page.emulateMediaFeatures([
        { name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' },
      ]);
      await page.setViewport({ width: 1280, height: 800 });
      await page.goto(`${origin}/export-dialog-test?mode=video`);
      await page.waitForSelector('.export-trigger');
      await page.evaluate((dark) => document.documentElement.classList.toggle('dark', dark), theme === 'dark');
      await page.click('.export-trigger');
      await page.click('.export-footer button');
      await page.waitForSelector('.export-status-host:not(.morphing)');
      await page.hover('.snip-pill');
      await page.evaluate(() => window.dispatchEvent(new Event('fixture:export-complete')));
      await page.waitForSelector('.completion-aura');
      const rect = await page.$eval('.snip-pill', (node) => {
        const { x, y, width, height } = node.getBoundingClientRect();
        return { x, y, width, height };
      });
      // Freeze a settled orbital position so this checks rendered pixels,
      // including the quiet part of the outline, rather than just SVG presence.
      await page.$eval('.completion-aura', (node) => {
        for (const animation of node.getAnimations({ subtree: true })) {
          animation.pause();
          animation.currentTime = 1_000;
        }
      });
      const pixels = await page.screenshot({
        path: `/tmp/beam-completion-aura-${theme}${reduced ? '-reduced' : ''}.png`,
        clip: { x: rect.x - 8, y: rect.y - 8, width: rect.width + 16, height: rect.height + 16 },
      });
      const edges = await page.evaluate(
        async ({ png, width, height }) => {
          const image = new Image();
          image.src = `data:image/png;base64,${png}`;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext('2d')!;
          context.drawImage(image, 0, 0);
          const { data } = context.getImageData(0, 0, image.width, image.height);
          const green = (x: number, y: number) => {
            const index = (y * image.width + x) * 4;
            return Math.min(data[index + 1]! - data[index]!, data[index + 1]! - data[index + 2]!) >= 18;
          };
          const horizontal = (y: number) => {
            let visible = 0;
            for (let x = 40; x < width - 24; x++) if (green(x, y - 1) || green(x, y)) visible++;
            return visible / (width - 64);
          };
          const vertical = (x: number) => {
            let visible = 0;
            for (let y = 32; y < height - 16; y++) if (green(x - 1, y) || green(x, y)) visible++;
            return visible / (height - 48);
          };
          return { top: horizontal(8), bottom: horizontal(height + 8), left: vertical(8), right: vertical(width + 8) };
        },
        { png: Buffer.from(pixels).toString('base64'), width: rect.width, height: rect.height },
      );
      for (const [edge, visible] of Object.entries(edges)) {
        expect(visible, `${theme} ${edge}: ${JSON.stringify(edges)}`).toBeGreaterThanOrEqual(0.75);
      }
      expect(await page.$('.mascot-melt')).toBeNull();
      expect(await page.$('.success-mark')).not.toBeNull();
      expect(await page.$eval('.completion-aura', (node) => getComputedStyle(node).pointerEvents)).toBe('none');
      if (reduced)
        expect(await page.$eval('.completion-aura', (node) => node.getAnimations({ subtree: true }).length)).toBe(0);
      await page.click('.snip-pill button[aria-label="Open folder"]');
      expect(await page.evaluate(() => document.body.dataset.openedFolder)).toBe(
        '/home/test/Videos/Beautiful captures.mp4',
      );
    },
  );
});
