const { execFileSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { createServer } = require('node:http');
const puppeteer = require('puppeteer-core');

async function main() {
  const directory = mkdtempSync(join(tmpdir(), 'beam-recordly-render-'));
  let browser;
  let server;
  try {
    const bundle = join(directory, 'probe.js');
    execFileSync(
      'bun',
      [
        'build',
        resolve(__dirname, '../../packages/runtime/src/zoom/recordly/recordly-render.browser.ts'),
        '--target=browser',
        `--outfile=${bundle}`,
      ],
      { stdio: 'pipe' },
    );
    server = createServer((request, response) => {
      response.setHeader('Content-Type', request.url === '/probe.js' ? 'text/javascript' : 'text/html');
      response.end(
        request.url === '/probe.js' ? readFileSync(bundle) : '<script type="module" src="/probe.js"></script>',
      );
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    const executablePath =
      process.env.CHROME_PATH ||
      execFileSync(process.platform === 'win32' ? 'where' : 'which', ['google-chrome'], { encoding: 'utf8' })
        .trim()
        .split(/\r?\n/)[0];
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
      protocolTimeout: 20000,
    });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => typeof globalThis.runRecordlyRender === 'function');
    const result = await page.evaluate(() => globalThis.runRecordlyRender());
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser?.close();
    if (server) await new Promise((done) => server.close(done));
    rmSync(directory, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
