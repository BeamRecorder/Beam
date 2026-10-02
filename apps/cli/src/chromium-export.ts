import type { MotionHost } from './motion-types';
import puppeteer, { type Browser } from 'puppeteer-core';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import type { CliRenderJob } from './render-job-types';
import { registerRenderAssets } from './local-assets';
import { createBinaryOutput } from '@beam/storage/node/binary-output';
import { createExportServer } from './export-server';
import { chromiumExecutable } from './chromium-install';
import { chromiumSettings } from './chromium-settings';
import { buildRenderBundle } from './render-bundle';
import { serveRenderBundle } from './bundle-server';
import { closeExportBrowser } from './browser-lifecycle';

/** Independent Chromium host: no editor window, Vue mount, capture API or running Beam application. */
export async function exportInChromium(
  request: CliRenderJob,
  directory: string,
  destination: string,
  overwrite = false,
  motion?: MotionHost,
) {
  const executablePath = await chromiumExecutable();
  const auth = randomUUID();
  const assets = registerRenderAssets(request, directory, auth);
  if (motion && !('kind' in assets.request))
    assets.request.frameSources = [{ assetId: motion.assetId, url: `/beam-cli/frame?auth=${auth}` }];
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
    let motionPage: Awaited<ReturnType<typeof import('./motion-page').createMotionPage>> | undefined;
    if (motion) {
      const { buildMotionBundle } = await import('./motion-bundle');
      for (const [route, file] of await buildMotionBundle(motion.entry, resolve(browserTemp, 'motion')))
        bundle.set(route, file);
    }
    const handle = createExportServer(auth, assets.request, assets.files, output, completed, failed);
    server = await serveRenderBundle(bundle, async (request, response, next) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (url.pathname !== '/beam-cli/frame') return handle(request, response, next);
      if (url.searchParams.get('auth') !== auth) {
        response.writeHead(403).end();
        return;
      }
      const timeMs = Number(url.searchParams.get('timeMs') ?? 0);
      if (request.method !== 'GET' || !Number.isFinite(timeMs) || timeMs < 0 || !motionPage) {
        response.writeHead(400).end();
        return;
      }
      try {
        response.setHeader('Content-Type', 'image/png');
        response.end(await motionPage.frame(timeMs));
      } catch (error) {
        response.writeHead(500).end(String(error));
        failed(new Error(String(error)));
      }
    });
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
    if (motion) {
      const { createMotionPage } = await import('./motion-page');
      motionPage = await createMotionPage(context, server.origin, motion, failed);
    }
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
