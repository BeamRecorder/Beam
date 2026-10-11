// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createExportBrowserHarness } from './export-dialog-browser-harness';

describe.runIf(process.env.BEAM_HEADLESS_TEST === '1')('landscape export dialogs in Chromium', () => {
  let harness: Awaited<ReturnType<typeof createExportBrowserHarness>>;
  let page: Awaited<ReturnType<typeof createExportBrowserHarness>>['page'], origin: string;
  beforeAll(async () => {
    harness = await createExportBrowserHarness();
    ({ page, origin } = harness);
  }, 30000);
  afterAll(async () => {
    await harness?.dispose();
  });

  it.each(['video', 'image'])('fades overflowing %s export options while the footer stays fixed', async (mode) => {
    await page.setViewport({ width: 1024, height: 420 });
    await page.goto(`${origin}/export-dialog-test?mode=${mode}`);
    await page.waitForSelector('.export-trigger');
    await page.click('.export-trigger');
    const viewport = '.dialog-scroll-body .scroll-shadow-viewport';
    await page.waitForSelector(viewport);
    await page.waitForFunction(
      (selector) => (document.querySelector(selector) as HTMLElement).style.maskImage.includes('transparent 100%'),
      {},
      viewport,
    );
    await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState === 'finished'));
    const before = await page.$eval('[role="dialog"]', (node) => ({
      headerTop: node.querySelector('.dialog-header')!.getBoundingClientRect().top,
      footerBottom: node.querySelector('.dialog-footer')!.getBoundingClientRect().bottom,
      count: node.querySelectorAll('.scroll-shadow-viewport').length,
    }));
    expect(before.footerBottom).toBeLessThanOrEqual(420);
    expect(before.count).toBe(1);
    await page.$eval(viewport, (node) => {
      node.scrollTop = (node.scrollHeight - node.clientHeight) / 2;
      node.dispatchEvent(new Event('scroll'));
    });
    await page.waitForFunction(
      (selector) => {
        const mask = (document.querySelector(selector) as HTMLElement).style.maskImage;
        return mask.includes('transparent 0%') && mask.includes('transparent 100%');
      },
      {},
      viewport,
    );
    expect(await page.$eval('.dialog-header', (node) => node.getBoundingClientRect().top)).toBe(before.headerTop);
    expect(await page.$eval('.dialog-footer', (node) => node.getBoundingClientRect().bottom)).toBe(before.footerBottom);
    await page.screenshot({ path: `/tmp/beam-export-${mode}-scroll.png` });
    await page.$eval(viewport, (node) => {
      node.scrollTop = node.scrollHeight;
      node.dispatchEvent(new Event('scroll'));
    });
    await page.waitForFunction(
      (selector) => !(document.querySelector(selector) as HTMLElement).style.maskImage.includes('transparent 100%'),
      {},
      viewport,
    );
    await page.setViewport({ width: 1024, height: 1000 });
    await page.waitForFunction(
      (selector) => getComputedStyle(document.querySelector(selector)!).maskImage === 'none',
      {},
      viewport,
    );
  });

  it('offers the GPU toggle only on Linux and keeps the footer visible', async () => {
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(`${origin}/export-dialog-test?platform=linux`);
    await page.waitForSelector('.export-trigger');
    await page.click('.export-trigger');
    await page.waitForSelector('[role="switch"][aria-label="FFmpeg GPU (experimental)"]:not(:disabled)');
    await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState === 'finished'));
    const geometry = await page.$eval('[role="dialog"]', (node) => {
      const dialog = node.getBoundingClientRect();
      const footer = node.querySelector('.export-footer')!.getBoundingClientRect();
      return { top: dialog.top, bottom: dialog.bottom, footerBottom: footer.bottom };
    });
    expect(geometry.top).toBeGreaterThanOrEqual(0);
    expect(geometry.bottom).toBeLessThanOrEqual(720);
    expect(geometry.footerBottom).toBeLessThanOrEqual(720);
    await page.screenshot({ path: '/tmp/beam-export-linux-gpu.png' });
  });

  it.each(['video', 'image'])('keeps completed %s file actions directly in the status pill', async (mode) => {
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(`${origin}/export-dialog-test?mode=${mode}`);
    await page.waitForSelector('.export-trigger');
    await page.click('.export-trigger');
    await page.waitForSelector('[role="dialog"]');
    await page.click('.export-footer button');
    await page.waitForSelector('.export-status-host:not(.morphing)');
    await page.evaluate(() => window.dispatchEvent(new Event('fixture:export-complete')));
    await page.waitForSelector('.snip-pill button[aria-label="Open folder"]');
    expect(await page.$('[role="dialog"]')).toBeNull();
    expect(
      await page.$$eval('.snip-pill button', (buttons) => buttons.map((button) => button.getAttribute('aria-label'))),
    ).toEqual([mode === 'video' ? 'Watch' : 'View image', 'Open folder']);
    await page.click('.snip-pill button[aria-label="Open folder"]');
    await page.click(`.snip-pill button[aria-label="${mode === 'video' ? 'Watch' : 'View image'}"]`);
    const target = `/home/test/Videos/Beautiful captures.${mode === 'video' ? 'mp4' : 'png'}`;
    expect(await page.evaluate(() => document.body.dataset.openedFile)).toBe(target);
    expect(await page.evaluate(() => document.body.dataset.openedFolder)).toBe(target);
    await page.mouse.move(100, 200);
    await page.screenshot({ path: `/tmp/beam-export-${mode}-complete.png` });
    await page.click('.export-trigger');
    await page.waitForSelector('input[aria-label="File name"]');
  });

  it.each(['light', 'dark'])(
    'keeps video and Screenshot wide, accessible and within the viewport in %s',
    async (theme) => {
      for (const mode of ['video', 'image']) {
        const errors: string[] = [];
        const onError = (error: unknown) => {
          errors.push(error instanceof Error ? error.message : String(error));
        };
        page.on('pageerror', onError);
        page.setDefaultTimeout(10000);
        await page.setViewport({ width: 1280, height: 800 });
        await page.goto(`${origin}/export-dialog-test?mode=${mode}`);
        await page.waitForSelector('.export-trigger', { timeout: 10000 });
        const trigger = await page.$eval('.export-trigger', (button) => {
          const bounds = button.getBoundingClientRect();
          const titlebar = button.closest('.editor-titlebar')!.getBoundingClientRect();
          return {
            height: bounds.height,
            topSpace: bounds.top - titlebar.top,
            bottomSpace: titlebar.bottom - bounds.bottom,
          };
        });
        expect(trigger.height).toBe(32);
        expect(trigger.topSpace).toBeGreaterThanOrEqual(3);
        expect(trigger.bottomSpace).toBeGreaterThanOrEqual(3);
        await page.evaluate((theme) => document.documentElement.classList.toggle('dark', theme === 'dark'), theme);
        await page.click('.export-trigger');
        await page.waitForSelector('[role="dialog"]');
        await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'File name');
        await page.waitForFunction(() =>
          document.getAnimations().every((animation) => animation.playState === 'finished'),
        );
        const geometry = await page.evaluate(() => {
          const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!.getBoundingClientRect();
          const fields = document.querySelector<HTMLElement>('.export-fields')!;
          const filename = fields.querySelector('.export-destination .input-wrapper')!.getBoundingClientRect();
          const format = fields
            .querySelector('.export-destination .export-format-choices, .export-destination .select-trigger')!
            .getBoundingClientRect();
          return {
            filenameTop: filename.top,
            filenameBottom: filename.bottom,
            formatTop: format.top,
            formatBottom: format.bottom,
            width: dialog.width,
            height: dialog.height,
            left: dialog.left,
            top: dialog.top,
            bottom: dialog.bottom,
            destinationBottom: fields.querySelector('.export-destination')!.getBoundingClientRect().bottom,
            settingsTop: fields.querySelector('.export-output-options')!.getBoundingClientRect().top,
            overflow: fields.scrollWidth > fields.clientWidth + 1,
            overflowingFields: [...fields.querySelectorAll<HTMLElement>('*')]
              .filter((node) => node.scrollWidth > node.clientWidth + 1)
              .map((node) => [node.className, node.scrollWidth, node.clientWidth, node.textContent?.trim()]),
          };
        });
        expect(geometry.width).toBeGreaterThan(geometry.height);
        expect(Math.abs(geometry.filenameTop - geometry.formatTop)).toBeLessThanOrEqual(1);
        expect(Math.abs(geometry.filenameBottom - geometry.formatBottom)).toBeLessThanOrEqual(1);
        expect(geometry.settingsTop).toBeGreaterThan(geometry.destinationBottom);
        expect(geometry.overflow, JSON.stringify(geometry.overflowingFields)).toBe(false);
        expect(geometry.left).toBeGreaterThanOrEqual(0);
        expect(geometry.top).toBeGreaterThanOrEqual(0);
        expect(geometry.bottom).toBeLessThanOrEqual(800);
        expect(await page.$('.export-output-options .is-overflowing')).toBeNull();
        await page.screenshot({ path: `/tmp/beam-export-${mode}-${theme}.png` });
        if (mode === 'video') {
          await page.hover('.export-destination > .field:nth-child(2) .info-tooltip-trigger');
          await page.waitForSelector('[role="tooltip"]');
          await page.waitForFunction(() =>
            document.getAnimations().every((animation) => animation.playState === 'finished'),
          );
          const help = await page.$eval('[role="tooltip"]', (element) => {
            const node = element as HTMLElement;
            const bounds = node.getBoundingClientRect();
            node.style.pointerEvents = 'auto';
            const paintedAbove = node.contains(
              document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2),
            );
            node.style.pointerEvents = '';
            return { text: node.textContent, paintedAbove };
          });
          expect(help.text).toContain('MP4:');
          expect(help.text).toContain('WebM:');
          expect(help.paintedAbove).toBe(true);
          await page.hover('input[aria-label="File name"]');
          await page.waitForFunction(() => !document.querySelector('[role="tooltip"]'));
          expect(
            await page.$eval('input[aria-label="File name"]', (node) => node.parentElement?.textContent),
          ).toContain('.mp4');
          const colors = await page.evaluate(() => ({
            on: getComputedStyle(document.querySelector('.export-audio [role="switch"]')!).backgroundColor,
            off: getComputedStyle(document.querySelector('.export-range [role="switch"]')!).backgroundColor,
          }));
          expect(colors.on).not.toBe(colors.off);
          const before = await page.$eval('.export-estimate strong', (node) => node.textContent);
          await page.evaluate(() =>
            Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
              .find((button) => button.textContent?.trim() === 'Low')!
              .click(),
          );
          await page.waitForFunction(
            (before) => document.querySelector('.export-estimate strong')?.textContent !== before,
            {},
            before,
          );
          expect(await page.$('.accordion-trigger')).toBeNull();
          expect(await page.$eval('[role="switch"]', (node) => node.checkVisibility())).toBe(true);
          await page.click('.export-range [role="switch"]');
          expect(await page.$eval('.export-range [role="switch"]', (node) => node.getAttribute('aria-checked'))).toBe(
            'true',
          );
          const rangeHeight = await page.$eval('[role="dialog"]', (node) => node.getBoundingClientRect().height);
          expect(rangeHeight).toBe(geometry.height);
          await page.click('[role="switch"]');
          expect(await page.$eval('[role="dialog"]', (node) => node.getBoundingClientRect().height)).toBe(rangeHeight);
          await page.click('.export-range [role="switch"]');
          await page.screenshot({ path: `/tmp/beam-export-options-${theme}.png` });
        } else {
          await page.click('.export-destination .select-trigger');
          await page.waitForSelector('[role="option"]');
          await page.waitForFunction(() =>
            document.getAnimations().every((animation) => animation.playState === 'finished'),
          );
          const target = await page.evaluate(() => {
            const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((node) =>
              node.textContent?.includes('WebP'),
            )!;
            const bounds = option.getBoundingClientRect();
            return {
              x: bounds.x + bounds.width / 2,
              y: bounds.y + bounds.height / 2,
              hittable: option.contains(
                document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2),
              ),
            };
          });
          expect(target.hittable).toBe(true);
          await page.mouse.click(target.x, target.y);
          await page.waitForSelector('input[type="range"]');
        }
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
        expect(await page.$eval('.export-trigger', (node) => node === document.activeElement)).toBe(true);
        expect(errors).toEqual([]);
        page.off('pageerror', onError);
      }
    },
    30000,
  );

  it.each(['fr', 'bg', 'pt-BR', 'pl', 'de'])(
    'keeps longer %s range and size labels inside the dialog',
    async (locale) => {
      await page.setViewport({ width: 1280, height: 800 });
      await page.goto(`${origin}/export-dialog-test?mode=video&locale=${locale}`);
      await page.waitForSelector('.export-trigger');
      await page.click('.export-trigger');
      await page.waitForSelector('.export-range');
      await page.waitForFunction(() =>
        document.getAnimations().every((animation) => animation.playState === 'finished'),
      );
      const layout = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]')!.getBoundingClientRect();
        const range = document.querySelector('.export-range')!;
        const footer = document.querySelector('.export-footer')!;
        const hint = document.querySelector('.export-estimate small')!;
        const button = footer.querySelector('.export-submit')!.getBoundingClientRect();
        return {
          width: dialog.width,
          height: dialog.height,
          overflow: range.scrollWidth > range.clientWidth + 1,
          footerOverflow: footer.scrollWidth > footer.clientWidth + 1,
          hintRight: hint.getBoundingClientRect().right,
          buttonLeft: button.left,
          bottom: dialog.bottom,
        };
      });
      expect(layout.width).toBeGreaterThan(layout.height);
      expect(layout.overflow).toBe(false);
      expect(layout.footerOverflow).toBe(false);
      expect(layout.hintRight).toBeLessThan(layout.buttonLeft);
      expect(layout.bottom).toBeLessThanOrEqual(800);
      expect(await page.$('.export-range .is-overflowing')).toBeNull();
      expect(
        await page.$$eval('.export-output-options .is-overflowing', (nodes) => nodes.map((node) => node.textContent)),
      ).toEqual([]);
      await page.screenshot({ path: `/tmp/beam-export-video-${locale}.png` });
    },
  );

  it('keeps every setting reachable in a narrow window', async () => {
    await page.setViewport({ width: 600, height: 700 });
    await page.goto(`${origin}/export-dialog-test?mode=video&locale=fr`);
    await page.waitForSelector('.export-trigger');
    await page.click('.export-trigger');
    await page.waitForSelector('.export-range');
    await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState === 'finished'));
    const layout = await page.evaluate(() => {
      const body = document.querySelector('.dialog-body')!;
      const dialog = document.querySelector('[role="dialog"]')!.getBoundingClientRect();
      return { overflow: body.scrollWidth > body.clientWidth + 1, top: dialog.top, bottom: dialog.bottom };
    });
    expect(layout.overflow).toBe(false);
    expect(layout.top).toBeGreaterThanOrEqual(0);
    expect(layout.bottom).toBeLessThanOrEqual(700);
    await page.click('.export-range [role="switch"]');
    expect(await page.$eval('.export-range [role="switch"]', (node) => node.getAttribute('aria-checked'))).toBe('true');
    await page.click('.export-audio [role="switch"]');
    expect(await page.$eval('[role="switch"]', (node) => node.getAttribute('aria-checked'))).toBe('false');
    expect(await page.$('.export-range .is-overflowing')).toBeNull();
  });

  it('keeps recent export folders selectable and lets the browse action change the path', async () => {
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(`${origin}/export-dialog-test?mode=video&locale=fr`);
    await page.waitForSelector('.export-trigger');
    await page.click('.export-trigger');
    const trigger = '[data-setting="exports-directory"] .select-trigger';
    await page.waitForFunction(
      (selector) => document.querySelector(selector)?.textContent?.trim() === '/home/test/Videos',
      {},
      trigger,
    );
    expect(await page.$('[data-setting="exports-directory"] input[readonly]')).toBeNull();
    await page.click(trigger);
    await page.waitForSelector('[role="option"]');
    await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState === 'finished'));
    await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[role="option"]')]
        .find((node) => node.textContent?.includes('/home/test/Previous exports'))!
        .click(),
    );
    await page.waitForFunction(
      (selector) => document.querySelector(selector)?.textContent?.trim() === '/home/test/Previous exports',
      {},
      trigger,
    );
    await page.click(trigger);
    await page.waitForSelector('[role="option"]');
    expect(await page.$$eval('[role="option"]', (nodes) => nodes.map((node) => node.textContent?.trim()))).toEqual([
      '/home/test/Videos',
      '/home/test/Previous exports',
    ]);
    await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[role="option"]')]
        .find((node) => node.textContent?.trim() === '/home/test/Videos')!
        .click(),
    );
    await page.waitForFunction(
      (selector) => document.querySelector(selector)?.textContent?.trim() === '/home/test/Videos',
      {},
      trigger,
    );
    await page.click('[data-setting="exports-directory"] button[aria-label="Choisir un dossier"]');
    await page.waitForFunction(
      (selector) => document.querySelector(selector)?.textContent?.trim() === '/home/albi/Téléchargements',
      {},
      trigger,
    );
  });

  it('opens an empty recent-folder list in Settings with useful help', async () => {
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(`${origin}/export-dialog-test?mode=folders&locale=fr`);
    const trigger = '[data-setting="exports-directory"] .select-trigger';
    await page.waitForSelector(trigger);
    await page.waitForFunction(
      (selector) => !document.querySelector<HTMLButtonElement>(selector)?.disabled,
      {},
      trigger,
    );
    await page.click(trigger);
    await page.waitForSelector('[role="listbox"] [role="status"]');
    expect(await page.$eval('[role="listbox"] [role="status"]', (node) => node.textContent)).toContain(
      'Choisissez un dossier',
    );
    expect(await page.$eval(trigger, (node) => node.getAttribute('aria-expanded'))).toBe('true');
    await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState === 'finished'));
    await page.screenshot({ path: '/tmp/beam-export-empty-folder.png' });
  });
});
