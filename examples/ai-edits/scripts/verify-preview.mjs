import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repository = resolve(root, '../..');
const require = createRequire(resolve(repository, 'package.json'));
const { createAgentServer } = require(resolve(repository, 'apps/desktop/electron/authoring/agent-server.cjs'));
const { build } = await import(resolve(repository, 'node_modules/vite/dist/node/index.js'));
const { default: vue } = await import(resolve(repository, 'node_modules/@vitejs/plugin-vue/dist/index.mjs'));
const executablePath = process.env.BEAM_CHROMIUM_EXECUTABLE;
if (!executablePath || !existsSync(executablePath))
  throw new Error('Set BEAM_CHROMIUM_EXECUTABLE to installed Chromium.');
const temporary = mkdtempSync(resolve(tmpdir(), 'beam-dom-preview-'));
const bundle = resolve(root, process.env.BEAM_COMPOSITION_BUILD || 'dist');
const capability = 'f'.repeat(64);
const hardware = process.env.BEAM_CHROMIUM_GPU === 'hardware';
let server, browser;
try {
  await build({
    configFile: false,
    root: repository,
    plugins: [vue()],
    logLevel: 'error',
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    resolve: { dedupe: ['vue'], alias: { '~': resolve(repository, 'apps/desktop/src') } },
    build: {
      outDir: resolve(temporary, 'host'),
      lib: { entry: resolve(root, 'tests/preview-host.js'), formats: ['es'], fileName: 'host', cssFileName: 'host' },
    },
  });
  let captures = 0;
  server = await createAgentServer({
    profile: 'preview-test',
    discoveryDirectory: resolve(temporary, 'discovery'),
    dispatch: () => {
      throw new Error('No native API in HTML');
    },
    bundleFile: () => null,
    frame: () => {
      captures++;
      throw new Error('Live preview must not request PNG frames');
    },
    previewFile(token, relative) {
      const file = resolve(bundle, relative);
      return token === capability && file.startsWith(bundle + '/') && existsSync(file)
        ? { file, entry: relative === 'index.html', previewId: 'html:rev' }
        : null;
    },
  });
  browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: hardware ? ['--enable-gpu'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 580, deviceScaleFactor: 1 });
  const errors = [],
    diagnostics = [];
  page.on('pageerror', (error) => {
    errors.push(String(error));
    console.error(String(error));
  });
  page.on('console', (message) => {
    if (message.type() === 'error') {
      diagnostics.push(message.text());
      console.error(message.text());
    }
  });
  await page.setRequestInterception(true);
  const source = `${server.origin}/preview/${capability}/index.html`;
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname === '/host')
      void request.respond({
        contentType: 'text/html',
        body: `
      <html><head><link rel="stylesheet" href="/host.css"><style>
      ${readFileSync(resolve(repository, 'apps/desktop/src/components/editor/canvas/EditorCanvas.css'), 'utf8')}
      .canvas-viewport{position:relative;width:1000px;height:580px;}
      </style></head><body><div id="app"></div><script>
      window.sourceCalls=0;
      window.capture={
        registerAuthoringDocument:()=>new Promise(resolve=>window.acknowledgeRegistration=resolve),
        onAuthoringRequest:()=>()=>{},replyAuthoringRequest:()=>{},
        getHtmlPreviewSource:async()=>{window.sourceCalls++;return ${JSON.stringify(source)};}
      };</script><script type="module" src="/host.js"></script></body></html>`,
      });
    else if (pathname === '/host.js' || pathname === '/host.css')
      void request.respond({
        contentType: pathname.endsWith('.css') ? 'text/css' : 'text/javascript',
        body: readFileSync(resolve(temporary, 'host', pathname.endsWith('.css') ? 'host.css' : 'host.js')),
      });
    else if (pathname === '/favicon.ico') void request.respond({ status: 204 });
    else void request.continue();
  });
  await page.goto(`${server.origin}/host`);
  await page.waitForFunction(() => !!window.acknowledgeRegistration);
  assert.equal(await page.evaluate(() => window.sourceCalls), 0, 'Wait for the document before resolving HTML');
  await page.evaluate(() => window.acknowledgeRegistration());
  await page.waitForSelector('iframe.ready', { timeout: 20000 });
  const frame = page.frames().find((frame) => frame.url() === source);
  assert.ok(frame, 'Composition is rendered inside the sandbox');
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas'),
      context = canvas.getContext('2d');
    context.fillStyle = '#f00';
    context.fillRect(0, 0, canvas.width, canvas.height);
  });
  assert.equal(
    await page.evaluate(() => document.elementFromPoint(100, 100)?.tagName),
    'CANVAS',
    'Pointer events still reach canvas',
  );
  assert.equal(
    await page.evaluate(() => document.elementFromPoint(215, 215)?.className),
    'canvas-selection-probe',
    'Selection remains above the preview',
  );
  assert.equal(await frame.evaluate(() => typeof window.capture), 'undefined');
  assert.equal(
    await frame.evaluate(() => {
      try {
        return !!parent.capture;
      } catch {
        return false;
      }
    }),
    false,
  );
  await page.evaluate(() => {
    const c = window.previewCheck,
      start = performance.now();
    c.playing = true;
    const tick = (now) => {
      if (!c.playing) return;
      c.playhead = (now - start) / 1000;
      c.ticks.push(now);
      c.time.value = 1 + c.playhead;
      if (c.playhead < 5) c.raf = requestAnimationFrame(tick);
      else c.playing = false;
    };
    c.raf = requestAnimationFrame(tick);
  });
  await page.waitForFunction(() => window.previewCheck.playhead > 4.9);
  await page.evaluate(() => {
    const controller = window.previewCheck;
    controller.playing = false;
    cancelAnimationFrame(controller.raf);
  });
  const timing = await page.evaluate(() => ({ time: window.previewCheck.playhead, ticks: window.previewCheck.ticks }));
  const visualTime = await frame.evaluate(() => window.aiNativeTimeline.time());
  assert.ok(Math.abs(visualTime - timing.time) < 0.08, `Visual clock ${visualTime} follows playhead ${timing.time}`);
  assert.ok(
    timing.ticks.length > (hardware ? 150 : 15),
    `Expected continuous playback, got ${timing.ticks.length} updates`,
  );
  await frame.waitForFunction((time) => Math.abs(window.aiNativeTimeline.time() - time) < 0.001, {}, timing.time);
  await frame.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const firstPause = digest(await page.screenshot());
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.equal(digest(await page.screenshot()), firstPause, 'Pause leaves the current frame unchanged');
  const seeks = [];
  for (const time of [12, 3, 12, 3]) {
    const start = performance.now();
    await page.evaluate((time) => {
      window.previewCheck.time.value = time + 1;
    }, time);
    await frame.waitForFunction((time) => Math.abs(window.aiNativeTimeline.time() - time) < 0.001, {}, time);
    await frame.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const state = await frame.evaluate(() =>
      Array.from(document.querySelectorAll('[style]'), (element) => [element.id, element.getAttribute('style')]),
    );
    seeks.push({
      time,
      latencyMs: performance.now() - start,
      state,
      hash: digest(await page.screenshot({ path: resolve('/tmp', `beam-preview-seek-${seeks.length}.png`) })),
    });
  }
  assert.deepEqual(seeks[0].state, seeks[2].state, 'Backward/forward seeks reproduce exactly');
  assert.deepEqual(seeks[1].state, seeks[3].state);
  assert.notEqual(seeks[0].hash, seeks[1].hash);
  assert.equal(captures, 0);
  assert.equal(await page.evaluate(() => window.sourceCalls), 1);
  assert.deepEqual(errors, []);
  assert.deepEqual(diagnostics, []);
  const gpu = await (await browser.target().createCDPSession()).send('SystemInfo.getInfo');
  console.log(
    JSON.stringify(
      {
        backend: hardware ? 'hardware' : 'software',
        gpu: gpu.gpu.auxAttributes.glRenderer,
        playbackUpdates: timing.ticks.length,
        visualTime,
        pause: 'stable',
        seeks: seeks.map(({ state, ...result }) => result),
        pngCaptures: captures,
        sourceRequests: 1,
        sandbox: 'isolated',
        runtimeErrors: errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  await server?.dispose();
  rmSync(temporary, { recursive: true, force: true });
}
