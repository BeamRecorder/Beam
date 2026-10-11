import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import puppeteer from 'puppeteer-core';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumExecutable } from '../../../../../../apps/cli/src/chromium-install';

export async function createExportBrowserHarness() {
  const root = fileURLToPath(new URL('../../../../../../', import.meta.url));
  const temp = await mkdtemp(resolve(tmpdir(), 'beam-export-dialog-'));
  const server = await createServer({
    root,
    configFile: false,
    cacheDir: resolve(temp, 'vite'),
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0, hmr: false },
    resolve: {
      dedupe: ['vue'],
      alias: {
        '~/ui': resolve(root, 'apps/desktop/src/components/ui'),
        '~': resolve(root, 'apps/desktop/src'),
      },
    },
    plugins: [
      {
        name: 'fixture-backgrounds',
        resolveId: (id) => (id === 'virtual:public-background-media' ? id : undefined),
        load: (id) =>
          id === 'virtual:public-background-media' ? 'export default { images: [], videos: [] }' : undefined,
      },
      {
        name: 'fixture-export-backend',
        enforce: 'pre',
        resolveId: (id, importer) =>
          id === './mediabunny/exporter' && importer?.endsWith('/useExportJob.ts')
            ? resolve(root, 'apps/desktop/src/components/export/tests/export-pill-fixture-backend.ts')
            : undefined,
      },
      vue(),
      {
        name: 'export-dialog-fixture',
        configureServer(server) {
          server.middlewares.use('/export-dialog-test', (_req, res) => {
            res.setHeader('Content-Type', 'text/html');
            res.end(
              '<!doctype html><link rel="icon" href="data:,"><div id="app"></div><script type="module" src="/apps/desktop/src/components/export/tests/export-dialog-browser-host.ts"></script>',
            );
          });
        },
      },
    ],
  });
  await server.listen();
  const address = server.httpServer!.address();
  if (!address || typeof address === 'string') throw new Error('No preference test port');
  const origin = `http://127.0.0.1:${address.port}`;
  const browser = await puppeteer.launch({
    executablePath: await chromiumExecutable(),
    headless: true,
    ignoreDefaultArgs: ['--hide-scrollbars'],
    userDataDir: resolve(temp, 'profile'),
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);
  return {
    page,
    origin,
    dispose: async () => {
      await browser.close();
      await server.close();
      await rm(temp, { recursive: true, force: true });
    },
  };
}
