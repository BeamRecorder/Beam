// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { expectCameraPreviewFill } from './camera-preview-browser';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumExecutable } from '../../../../../../apps/cli/src/chromium-install';

const fixture = `
import { createApp, h, nextTick, reactive } from 'vue';
import { createI18n } from 'vue-i18n';
import CameraPreviewOverlay from '/apps/desktop/src/components/hud/camera/CameraPreviewOverlay.vue';
import messages from '/apps/desktop/src/i18n/en/core.json';
const props = reactive({ cameraId: 'off', isHovered: false, isRecording: false });
let stream, source, frame, requests = 0;
Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
  getUserMedia: async () => { requests++; return stream; }
} });
createApp({ render: () => h(CameraPreviewOverlay, props) }).use(createI18n({ legacy: false, locale: 'en', messages: { en: messages } })).mount('#app');
window.cameraTest = {
  async start(width, height) {
    props.cameraId = 'off'; await nextTick();
    cancelAnimationFrame(frame);
    source = document.createElement('canvas'); source.width = width; source.height = height;
    const context = source.getContext('2d');
    const draw = () => {
      context.fillStyle = '#666'; context.fillRect(0, 0, width, height);
      context.fillStyle = '#f00'; context.fillRect(0, 0, width * .12, height);
      context.fillStyle = '#0f0'; context.fillRect(width * .88, 0, width * .12, height);
      context.fillStyle = '#ff0'; context.fillRect(width * .12, 0, width * .76, height * .12);
      context.fillStyle = '#00f'; context.fillRect(width * .12, height * .88, width * .76, height * .12);
      frame = requestAnimationFrame(draw);
    };
    draw(); stream = source.captureStream(30);
    props.cameraId = 'camera:chromium:test-' + width + '-' + height;
    await nextTick();
  },
  async recording(value) { props.isRecording = value; props.isHovered = value; await nextTick(); },
  requests() { return requests; }
};
`;

describe.runIf(process.env.BEAM_HEADLESS_TEST === '1')('filled webcam preview in Chromium', () => {
  let server: ViteDevServer, browser: Browser, page: Page, temp: string;
  beforeAll(async () => {
    const root = fileURLToPath(new URL('../../../../../../', import.meta.url));
    temp = await mkdtemp(resolve(tmpdir(), 'beam-camera-preview-'));
    server = await createServer({
      root,
      configFile: false,
      cacheDir: resolve(temp, 'vite'),
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0 },
      resolve: { dedupe: ['vue'], alias: { '~': resolve(root, 'apps/desktop/src') } },
      plugins: [
        vue(),
        {
          name: 'camera-preview-fixture',
          resolveId: (id) => (id === 'virtual:camera-preview-test' ? '\0camera-preview-test' : undefined),
          load: (id) => (id === '\0camera-preview-test' ? fixture : undefined),
          configureServer(server) {
            server.middlewares.use('/camera-preview-test', (_req, res) => {
              res.setHeader('Content-Type', 'text/html');
              res.end(
                '<!doctype html><link rel="icon" href="data:,"><body style="margin:0"><div id="app"></div><script>window.capture={configureCameraOverlay(){throw new Error("Unexpected camera failure")}}</script><script type="module" src="/@id/virtual:camera-preview-test"></script>',
              );
            });
          },
        },
      ],
    });
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === 'string') throw new Error('No camera preview test port');
    browser = await puppeteer.launch({
      executablePath: await chromiumExecutable(),
      headless: true,
      userDataDir: resolve(temp, 'profile'),
      args: ['--no-sandbox'],
    });
    page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto(`http://127.0.0.1:${address.port}/camera-preview-test`);
    try {
      await page.waitForFunction('Boolean(window.cameraTest)', { timeout: 10000 });
    } catch (error) {
      throw new Error(errors.join('\n') || String(error));
    }
  }, 30000);
  afterAll(async () => {
    await browser?.close();
    await server?.close();
    if (temp) await rm(temp, { recursive: true, force: true });
  });

  const expectFilledFrame = async (width: number, height: number, size = { width: 220, height: 220 }) => {
    await page.setViewport(size);
    await expectCameraPreviewFill(page, width, height);
  };
  const start = async (width: number, height: number) => {
    await page.evaluate(`window.cameraTest.start(${width}, ${height})`);
    await page.waitForFunction(() => {
      const video = document.querySelector('video');
      return video && video.readyState >= 2 && !document.querySelector('.camera-overlay-skeleton');
    });
  };
  it.each([
    [640, 360],
    [640, 480],
    [360, 640],
  ])(
    'fills the default square from a %s × %s camera without stretching or changing the source',
    async (width, height) => {
      await start(width, height);
      await expectFilledFrame(width, height);
    },
  );
  it('fills wide and tall native-window resizes without reopening the camera', async () => {
    await start(640, 360);
    const requests = await page.evaluate('window.cameraTest.requests()');
    await expectFilledFrame(640, 360, { width: 360, height: 180 });
    await expectFilledFrame(640, 360, { width: 150, height: 300 });
    expect(await page.evaluate('window.cameraTest.requests()')).toBe(requests);
  });
  it('keeps the same framing on hover and during recording', async () => {
    await start(640, 360);
    await page.evaluate('window.cameraTest.recording(true)');
    await expectFilledFrame(640, 360);
    await page.evaluate('window.cameraTest.recording(false)');
    await expectFilledFrame(640, 360);
  });
});
