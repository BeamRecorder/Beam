const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { agentDirectory } = require('@beam/native-client/agent-discovery');
const { htmlPreviewPage, htmlPreviewHeaders } = require('./html-preview-page.cjs');

const mime = (file) =>
  ({
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.json': 'application/json',
    '.wasm': 'application/wasm',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf',
  })[path.extname(file)] || 'application/octet-stream';
async function createAgentServer({
  dispatch,
  bundleFile,
  previewFile,
  frame,
  profile,
  discoveryDirectory = agentDirectory(),
}) {
  const token = randomBytes(32).toString('hex');
  const json = (response, status, value) => {
    response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(value));
  };
  const server = http.createServer(async (request, response) => {
    try {
      // Never accept browser cross-origin RPC, even from a local web application.
      if (!/^127\.0\.0\.1:\d+$/.test(request.headers.host || ''))
        return json(response, 403, { error: 'Forbidden origin or host.' });
      const url = new URL(request.url, 'http://127.0.0.1');
      const preview = /^\/preview\/([0-9a-f]{64})\/(.+)$/.exec(url.pathname);
      if (request.method === 'GET' && preview) {
        const source = previewFile?.(preview[1], decodeURIComponent(preview[2]));
        if (!source) return json(response, 404, { error: 'Unknown composition.' });
        const base = `http://${request.headers.host}/preview/${preview[1]}/`;
        response.writeHead(200, { ...htmlPreviewHeaders(base), 'Content-Type': mime(source.file) });
        if (source.entry)
          response.end(htmlPreviewPage(await fs.promises.readFile(source.file, 'utf8'), source.previewId));
        else
          fs.createReadStream(source.file)
            .on('error', () => response.destroy())
            .pipe(response);
        return;
      }
      const bundle = /^\/html\/([0-9a-f]{64})\/(.+)$/.exec(url.pathname);
      if (request.method === 'GET' && bundle) {
        const file = bundleFile(bundle[1], decodeURIComponent(bundle[2]));
        if (!file) return json(response, 404, { error: 'Unknown composition.' });
        response.writeHead(200, { 'Content-Type': mime(file), 'Cache-Control': 'no-store' });
        fs.createReadStream(file)
          .on('error', () => response.destroy())
          .pipe(response);
        return;
      }
      const source = /^\/frame\/([0-9a-f]{64})$/.exec(url.pathname);
      if (request.method === 'GET' && source) {
        const width = url.searchParams.has('width') ? Number(url.searchParams.get('width')) : undefined;
        if (width !== undefined && ![240, 480, 960].includes(width)) throw new Error('Invalid HTML thumbnail width.');
        const bytes = await frame(source[1], Number(url.searchParams.get('timeMs')), width);
        response.writeHead(200, {
          'Content-Type': 'image/png',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
        });
        response.end(bytes);
        return;
      }
      if (request.headers.origin) return json(response, 403, { error: 'Forbidden RPC origin.' });
      if (request.method !== 'POST' || url.pathname !== '/rpc' || request.headers.authorization !== `Bearer ${token}`)
        return json(response, 401, { error: 'Unauthorized.' });
      let size = 0;
      const chunks = [];
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 8 * 1024 * 1024) return json(response, 413, { error: 'Request too large.' });
        chunks.push(chunk);
      }
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (input?.version !== 1 || typeof input.tool !== 'string') throw new Error('Invalid agent request.');
      json(response, 200, { version: 1, ok: true, result: await dispatch(input.tool, input.arguments ?? {}) });
    } catch (error) {
      if (!response.headersSent)
        json(response, 400, { version: 1, ok: false, error: error instanceof Error ? error.message : String(error) });
      else response.destroy();
    }
  });
  server.requestTimeout = 40000;
  server.headersTimeout = 10000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  const discoveryFile = path.join(discoveryDirectory, `${process.pid}.json`);
  try {
    fs.mkdirSync(discoveryDirectory, { recursive: true, mode: 0o700 });
    if (fs.lstatSync(discoveryDirectory).isSymbolicLink()) throw new Error('Invalid agent discovery directory.');
    fs.chmodSync(discoveryDirectory, 0o700);
    // A crashed process can leave a discovery file whose PID is later reused.
    fs.rmSync(discoveryFile, { force: true });
    fs.writeFileSync(discoveryFile, JSON.stringify({ version: 1, pid: process.pid, port, token, profile }), {
      mode: 0o600,
      flag: 'wx',
    });
  } catch (error) {
    server.close();
    throw error;
  }
  return {
    origin: `http://127.0.0.1:${port}`,
    async dispose() {
      fs.rmSync(discoveryFile, { force: true });
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
module.exports = { createAgentServer };
