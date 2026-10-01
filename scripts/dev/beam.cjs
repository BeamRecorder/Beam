const path = require('node:path');
const { parseDevelopmentArguments, resolveDevelopmentEngine, startElectron } = require('./electron.cjs');
const { developmentSessionId } = require('../../electron/lifecycle/development-session.cjs');

const applicationRoot = path.join(__dirname, '../..');

async function runDevelopment({
  args = process.argv.slice(2),
  root = applicationRoot,
  env = process.env,
  processTarget = process,
  createServer = async (options) => (await import('vite')).createServer(options),
  resolveEngine = resolveDevelopmentEngine,
  launchElectron = startElectron,
  getElectronPath = () => require('electron'),
  log = console.log,
} = {}) {
  const { forceNoRust, session = env.BEAM_DEV_SESSION ?? 'default' } = parseDevelopmentArguments(args);
  const id = developmentSessionId(root, session);
  const controller = new AbortController();
  const stop = () => controller.abort();
  processTarget.on('SIGINT', stop);
  processTarget.on('SIGTERM', stop);
  let server;
  try {
    server = await createServer({
      root,
      configFile: path.join(root, 'vite.config.ts'),
      cacheDir: path.join(root, 'node_modules', '.vite', id),
      server: { host: 'localhost', port: 6500, strictPort: false },
    });
    if (controller.signal.aborted) return;
    await server.listen();
    const address = server.httpServer.address();
    if (!address || typeof address === 'string') throw new Error('Vite did not open a development port.');
    const origin = `http://localhost:${address.port}`;
    log(`[beam:dev] Worktree: ${root}\n[beam:dev] Session: ${session} (${id})\n[beam:dev] Renderer: ${origin}`);
    const electronPath = getElectronPath();
    const { version } = require(path.join(root, 'package.json'));
    const executable = await resolveEngine({
      applicationRoot: root,
      version,
      env,
      signal: controller.signal,
      ...(forceNoRust ? { hasCargo: () => false } : {}),
    });
    if (controller.signal.aborted) return;
    log(`[beam:dev] Using ${executable}`);
    await launchElectron(executable, {
      root,
      electronPath,
      signal: controller.signal,
      env: { ...env, BEAM_DEV_SESSION: session, BEAM_DEV_SERVER_URL: origin },
    });
  } catch (error) {
    if (!controller.signal.aborted) throw error;
  } finally {
    processTarget.removeListener('SIGINT', stop);
    processTarget.removeListener('SIGTERM', stop);
    await server?.close();
  }
}

if (require.main === module) {
  runDevelopment().catch((error) => {
    console.error(`[beam:dev] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { runDevelopment };
