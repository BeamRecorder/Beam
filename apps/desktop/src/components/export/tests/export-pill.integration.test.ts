// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createExportBrowserHarness } from './export-dialog-browser-harness';

describe.runIf(process.env.BEAM_HEADLESS_TEST === '1')('export pill in hidden Chromium', () => {
  let harness: Awaited<ReturnType<typeof createExportBrowserHarness>>;
  beforeAll(async () => {
    harness = await createExportBrowserHarness();
  }, 30000);
  afterAll(async () => {
    await harness?.dispose();
  });

  it.each(['video', 'image'])('morphs the %s dialog without blocking the editor or moving its window', async (mode) => {
    const { page, origin } = harness;
    await page.emulateMediaFeatures([]);
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(`${origin}/export-dialog-test?mode=${mode}`);
    await page.waitForSelector('.export-trigger');
    await page.click('.export-trigger');
    await page.waitForSelector('[role="dialog"]');
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'File name');
    const initial = await page.$eval('[role="dialog"]', (node) => ({
      width: node.getBoundingClientRect().width,
      left: node.getBoundingClientRect().left,
    }));
    await page.click('.export-footer button');
    await page.waitForSelector('.export-morph-surface');
    const middle = await page.$eval('.export-morph-surface', (node) => {
      const animation = node.getAnimations()[0]!;
      animation.pause();
      animation.currentTime = 140;
      const rect = node.getBoundingClientRect();
      return {
        width: rect.width,
        left: rect.left,
        inert: node.hasAttribute('inert'),
        hidden: node.getAttribute('aria-hidden'),
        pointer: getComputedStyle(node).pointerEvents,
      };
    });
    expect(middle.width).toBeLessThan(initial.width);
    expect(middle.width).toBeGreaterThan(356);
    expect(middle.left).toBeGreaterThan(initial.left);
    expect(middle.inert).toBe(true);
    expect(middle.hidden).toBe('true');
    expect(middle.pointer).toBe('none');
    expect(await page.$('.dialog-overlay')).toBeNull();
    expect(await page.$('[role="dialog"]')).toBeNull();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
    await page.click('.editor-test-action');
    expect(await page.evaluate(() => document.body.dataset.editorClicks)).toBe('1');
    await page.$eval('.export-morph-surface', (node) => node.getAnimations()[0]!.play());
    await page.waitForSelector('.export-morph-surface', { hidden: true });
    await page.waitForSelector('.export-status-host:not(.morphing)');
    const pill = await page.$eval('.snip-pill', (node) => {
      const rect = node.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        right: rect.right,
        bottom: rect.bottom,
        drag: getComputedStyle(node).getPropertyValue('app-region'),
      };
    });
    expect(pill).toMatchObject({ width: 356, height: 76, right: 1256, bottom: 776, drag: 'no-drag' });
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('fixture:export-progress', { detail: 0.42 })));
    if (mode === 'video')
      await page.waitForFunction(
        () => document.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow') === '42',
      );
    else expect(await page.$eval('[role="progressbar"]', (node) => node.hasAttribute('aria-valuenow'))).toBe(false);
    await page.screenshot({ path: `/tmp/beam-export-${mode}-pill-progress.png` });
    const mascotLeft = await page.$eval('.status-value', (node) => node.getBoundingClientRect().left);
    await page.evaluate(() => window.dispatchEvent(new Event('fixture:export-complete')));
    await page.waitForSelector('.snip-pill button[aria-label="Open folder"]');
    expect(await page.$('.completion-aura')).not.toBeNull();
    expect(await page.$eval('.status-value', (node) => node.getBoundingClientRect().left)).toBe(mascotLeft);
    expect(await page.$eval('.aura-orbit', (node) => node.getAnimations()[0]!.effect!.getTiming().iterations)).toBe(
      Infinity,
    );
    expect(
      await page.$$eval('.snip-pill button', (buttons) =>
        buttons.every(
          (button) => button.getBoundingClientRect().width >= 44 && button.getBoundingClientRect().height >= 44,
        ),
      ),
    ).toBe(true);
    expect(await page.$('.beam-mascot')).toBeNull();
    expect(await page.$('.mascot-melt')).toBeNull();
    expect(await page.$('.success-mark')).not.toBeNull();
    await page.mouse.move(100, 300);
    await page.screenshot({ path: `/tmp/beam-export-${mode}-check-aura-complete.png` });
  });

  it.each(['video', 'image'])('cancels the real %s job from its hover actions', async (mode) => {
    const { page, origin } = harness;
    await page.goto(`${origin}/export-dialog-test?mode=${mode}`);
    await page.waitForSelector('.export-trigger');
    await page.click('.export-trigger');
    await page.click('.export-footer button');
    await page.waitForSelector('.export-status-host:not(.morphing)');
    await page.hover('.snip-pill');
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.snip-details')!).opacity === '1');
    await page.evaluate(() =>
      [...document.querySelectorAll<HTMLButtonElement>('.snip-details button')]
        .find((button) => button.textContent?.trim() === 'Cancel Export')!
        .click(),
    );
    await page.waitForSelector('.export-status-host', { hidden: true });
    await page.click('.export-trigger');
    await page.waitForSelector('input[aria-label="File name"]');
  });

  it.each(['video', 'image'])(
    'removes the finished %s pill after five seconds without user dismissal',
    async (mode) => {
      const { page, origin } = harness;
      await page.emulateMediaFeatures([]);
      await page.setViewport({ width: 1280, height: 800 });
      await page.goto(`${origin}/export-dialog-test?mode=${mode}`);
      await page.waitForSelector('.export-trigger');
      await page.click('.export-trigger');
      await page.click('.export-footer button');
      await page.waitForSelector('.export-status-host:not(.morphing)');
      await page.mouse.move(100, 300);
      const started = await page.evaluate(() => {
        window.dispatchEvent(new Event('fixture:export-complete'));
        return performance.now();
      });
      await page.waitForSelector('.snip-pill button[aria-label="Open folder"]');
      expect(await page.$('.completion-aura')).not.toBeNull();
      await page.waitForSelector('.export-status-host', { hidden: true, timeout: 7_000 });
      const elapsed = await page.evaluate(() => performance.now());
      expect(elapsed - started).toBeGreaterThanOrEqual(4_900);
      expect(elapsed - started).toBeLessThan(7_000);
      expect(await page.$('.completion-aura')).toBeNull();
      expect(await page.$('[role="dialog"]')).toBeNull();
      await page.click('.editor-test-action');
    },
    15_000,
  );

  it('leaves five visible seconds when completion rendering is busy', async () => {
    const { page, origin } = harness;
    await page.goto(`${origin}/export-dialog-test?mode=video`);
    await page.waitForSelector('.export-trigger');
    await page.click('.export-trigger');
    await page.click('.export-footer button');
    await page.waitForSelector('.export-status-host:not(.morphing)');
    await page.mouse.move(100, 300);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const observer = new MutationObserver(() => {
            if (!document.querySelector('[role="status"]')?.textContent?.includes('Video ready')) return;
            observer.disconnect();
            // Finalization can keep the renderer busy after Vue updates the DOM,
            // but before Chromium paints the completion state for the user.
            const until = performance.now() + 4_100;
            while (performance.now() < until) {
              /* Simulate a busy completion frame. */
            }
            resolve();
          });
          observer.observe(document.body, { subtree: true, childList: true, characterData: true });
          window.dispatchEvent(new Event('fixture:export-complete'));
        }),
    );
    await page.waitForSelector('.snip-pill button[aria-label="Open folder"]');
    const visibleAt = await page.evaluate(() => performance.now());
    await page.waitForSelector('.export-status-host', { hidden: true, timeout: 7_000 });
    const closedAt = await page.evaluate(() => performance.now());
    expect(closedAt - visibleAt).toBeGreaterThanOrEqual(4_900);
    expect(closedAt - visibleAt).toBeLessThan(7_000);
  }, 20_000);

  it('shows the checkmark, static aura and file actions directly with reduced motion', async () => {
    const { page, origin } = harness;
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.setViewport({ width: 420, height: 700 });
    await page.goto(`${origin}/export-dialog-test?mode=image`);
    await page.waitForSelector('.export-trigger');
    await page.click('.export-trigger');
    await page.click('.export-footer button');
    await page.waitForSelector('.export-status-host');
    expect(await page.$('.export-morph-surface')).toBeNull();
    await page.evaluate(() => window.dispatchEvent(new Event('fixture:export-complete')));
    await page.waitForSelector('.snip-pill button[aria-label="Open folder"]');
    expect(await page.$('.status-value.celebrating')).toBeNull();
    expect(await page.$('.beam-mascot')).toBeNull();
    expect(await page.$eval('.completion-aura', (node) => node.getAnimations({ subtree: true }).length)).toBe(0);
    expect(await page.$eval('.snip-pill', (node) => node.getBoundingClientRect().right)).toBeLessThanOrEqual(420);
    await page.screenshot({ path: '/tmp/beam-export-image-reduced-motion.png' });
  });
});
