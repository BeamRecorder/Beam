import puppeteer, { type Browser } from 'puppeteer-core';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import type { ExportRequest } from '@beam/encoder';
import { registerLocalAssets } from './local-assets';
import { createBinaryOutput } from './binary-output';
import { createExportServer } from './export-server';
import { chromiumExecutable } from './chromium-install';
import { chromiumSettings } from './chromium-settings';
import { buildRenderBundle } from './render-bundle';
import { serveRenderBundle } from './bundle-server';
import { closeExportBrowser } from './browser-lifecycle';

/** Independent Chromium host: no editor window, Vue mount, capture API or running Beam application. */
export async function exportInChromium(
  request: ExportRequest,
  directory: string,
  destination: string,
  overwrite = false,
) {
  const executablePath = await chromiumExecutable();
  const auth = randomUUID();
  const assets = registerLocalAssets(request, directory, auth);
  const output = await createBinaryOutput(destination, overwrite);
  let server: Awaited<ReturnType<typeof serveRenderBundle>> | undefined;
  let browser: Browser | undefined;
  let browserTemp: string | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let onInterrupt: (() => void) | undefined;
  try {
    let completed!: (result: unknown) => void, failed!: (error: Error) => void;
    const result = new Promise<unknown>((resolve, reject) => {
      completed = resolve;
      failed = reject;
    });
    // Browser events can reject before context creation/navigation has finished.
    void result.catch(() => undefined);
    // Chromium's Unix socket path is bounded; project paths can exceed that bound.
    const tempRoot = resolve(homedir(), '.cache');
    await mkdir(tempRoot, { recursive: true });
    browserTemp = await mkdtemp(resolve(tempRoot, 'beam-'));
    const bundle = await buildRenderBundle(resolve(browserTemp, 'bundle'));
    server = await serveRenderBundle(
      bundle,
      createExportServer(auth, assets.request, assets.files, output, completed, failed),
    );
    const url = `${server.origin}/export.html?auth=${auth}`;
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      pipe: true,
      args: chromiumSettings().args,
      userDataDir: resolve(browserTemp, 'profile'),
      env: { ...process.env, TMPDIR: browserTemp },
    });
    browser.on('disconnected', () => failed(new Error('Chromium export backend disconnected.')));
    const context = await browser.createBrowserContext();
    await context.overridePermissions(new URL(url).origin, []);
    const page = await context.newPage();
    if (process.env.BEAM_DEBUG) {
      page.on('console', (message) => process.stderr.write(`[Chromium] ${message.text()}\n`));
      page.on('requestfailed', (request) =>
        process.stderr.write(`[Chromium] ${request.url()}: ${request.failure()?.errorText}\n`),
      );
    }
    page.on('pageerror', (error) => failed(new Error(String(error))));
    page.on('popup', (popup) => {
      void popup?.close();
    });
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame() && frame.url() !== url) failed(new Error('Unexpected backend navigation.'));
    });
    timeout = setTimeout(() => failed(new Error('Chromium export exceeded one hour.')), 3600000);
    onInterrupt = () => failed(new Error('Export interrupted.'));
    process.once('SIGINT', onInterrupt);
    process.once('SIGTERM', onInterrupt);
    // Attach rejection handling before navigation: a worker can finish or fail while goto is pending.
    const navigation = page.goto(url).catch(failed);
    const completedResult = await result;
    await navigation;
    return completedResult;
  } finally {
    if (timeout) clearTimeout(timeout);
    if (onInterrupt) {
      process.removeListener('SIGINT', onInterrupt);
      process.removeListener('SIGTERM', onInterrupt);
    }
    if (browser) await closeExportBrowser(browser);
    try {
      await server?.close();
    } finally {
      try {
        if (browserTemp) await rm(browserTemp, { recursive: true, force: true });
      } finally {
        await output.abort();
      }
    }
  }
}
