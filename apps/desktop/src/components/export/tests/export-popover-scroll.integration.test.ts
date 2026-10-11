// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createExportBrowserHarness } from './export-dialog-browser-harness';

describe.runIf(process.env.BEAM_HEADLESS_TEST === '1')('export folder menu scrolling in Chromium', () => {
  let harness: Awaited<ReturnType<typeof createExportBrowserHarness>>;
  beforeAll(async () => {
    harness = await createExportBrowserHarness();
  }, 30000);
  afterAll(async () => {
    await harness?.dispose();
  });

  const open = async (mode: string) => {
    const { page, origin } = harness;
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(`${origin}/export-dialog-test?mode=${mode}`);
    await page.waitForSelector('[data-setting="exports-directory"] .select-trigger:not(:disabled)');
    await page.click('[data-setting="exports-directory"] .select-trigger');
    await page.waitForSelector('.popover-viewport');
    await page.waitForFunction(
      () => !document.querySelector('.popover-content')?.classList.contains('pop-enter-active'),
    );
  };
  it('does not create a gutter or scrollbar for an empty folder menu', async () => {
    await open('folders');
    const geometry = await harness.page.$eval('.popover-viewport', (viewport) => ({
      width: viewport.clientWidth,
      outerWidth: viewport.getBoundingClientRect().width,
      height: viewport.clientHeight,
      scrollHeight: viewport.scrollHeight,
      overflowX: viewport.scrollWidth > viewport.clientWidth,
    }));
    expect(geometry.outerWidth - geometry.width).toBeLessThan(1);
    expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.height);
    expect(geometry.overflowX).toBe(false);
    expect(await harness.page.$eval('.popover-content', (node) => getComputedStyle(node).overflowY)).toBe('clip');
  });
  it('keeps short recent-folder lists free of both outer and inner scrollbars', async () => {
    const { page, origin } = harness;
    await page.goto(`${origin}/export-dialog-test?mode=image`);
    await page.waitForSelector('.export-trigger');
    await page.click('.export-trigger');
    await page.waitForSelector('[data-setting="exports-directory"] .select-trigger:not(:disabled)');
    await page.click('[data-setting="exports-directory"] .select-trigger');
    await page.waitForSelector('.popover-viewport');
    const viewports = await page.$$eval('.popover-viewport, .virtual-scroll-container', (nodes) =>
      nodes.map((node) => ({
        height: node.clientHeight,
        scrollHeight: node.scrollHeight,
        width: node.clientWidth,
        outerWidth: node.getBoundingClientRect().width,
      })),
    );
    expect(viewports).toHaveLength(2);
    for (const viewport of viewports) {
      expect(viewport.scrollHeight).toBeLessThanOrEqual(viewport.height);
      expect(viewport.outerWidth - viewport.width).toBeLessThan(1);
    }
  });
  it('scrolls genuinely tall content within a fixed blurred surface and renderer bounds', async () => {
    await open('folders');
    const { page } = harness;
    await page.$eval('.popover-viewport', (viewport) => {
      const content = document.createElement('div');
      content.style.height = '1200px';
      content.style.width = '100%';
      viewport.replaceChildren(content);
    });
    await page.waitForFunction(() => {
      const viewport = document.querySelector('.popover-viewport')!;
      const bounds = document.querySelector('.popover-content')!.getBoundingClientRect();
      return (
        viewport.scrollHeight > viewport.clientHeight &&
        viewport.clientHeight > 0 &&
        bounds.top >= 8 &&
        bounds.bottom <= window.innerHeight - 8
      );
    });
    const before = await page.$eval('.popover-content', (node) => node.getBoundingClientRect().toJSON());
    await page.hover('.popover-viewport');
    await page.mouse.wheel({ deltaY: 350 });
    await page.waitForFunction(() => document.querySelector('.popover-viewport')!.scrollTop > 100);
    const result = await page.$eval('.popover-content', (node) => ({
      bounds: node.getBoundingClientRect().toJSON(),
      outerScroll: node.scrollTop,
      blur: getComputedStyle(node, '::before').backdropFilter,
      overflowX: node.scrollWidth > node.clientWidth + 1,
    }));
    expect(result.bounds.top).toBeGreaterThanOrEqual(8);
    expect(result.bounds.bottom).toBeLessThanOrEqual(792);
    expect(result.bounds).toEqual(before);
    expect(result.outerScroll).toBe(0);
    expect(result.blur).toContain('blur(12px)');
    expect(result.overflowX).toBe(false);
  });
});
