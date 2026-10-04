const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');
const { createAgentServer } = require('../apps/desktop/electron/authoring/agent-server.cjs');
const { createDocumentBridge } = require('../apps/desktop/electron/authoring/document-bridge.cjs');
const { createHtmlFiles } = require('../apps/desktop/electron/authoring/html-files.cjs');
const { discoverAgents, agentDirectory } = require('../packages/native-client/src/agent-discovery.cjs');

const temporary = (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-agent-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
};
const html = () => ({
  version: 1,
  id: randomUUID(),
  revision: randomUUID(),
  entry: 'index.html',
  width: 64,
  height: 64,
  durationMs: 0,
  fps: 30,
  framework: 'html',
});

test('agent RPC authenticates, rejects browser origins and hides credentials from results', async (t) => {
  const directory = temporary(t);
  const server = await createAgentServer({
    discoveryDirectory: directory,
    dispatch: async (tool) => ({ tool }),
    bundleFile: () => null,
    frame: async () => Buffer.from('PNG'),
    profile: 'test',
  });
  t.after(() => server.dispose());
  const [instance] = discoverAgents(directory);
  assert.ok(instance);
  assert.equal(instance.pid, process.pid);
  if (process.platform !== 'win32')
    assert.equal(fs.statSync(path.join(directory, `${process.pid}.json`)).mode & 0o777, 0o600);
  const headers = { Authorization: `Bearer ${instance.token}` };
  const body = JSON.stringify({ version: 1, tool: 'projects.list', arguments: {} });
  const success = await fetch(`${server.origin}/rpc`, { method: 'POST', headers, body });
  assert.deepEqual(await success.json(), { version: 1, ok: true, result: { tool: 'projects.list' } });
  assert.equal((await fetch(`${server.origin}/rpc`, { method: 'POST', body })).status, 401);
  assert.equal(
    (
      await fetch(`${server.origin}/rpc`, {
        method: 'POST',
        headers: { ...headers, Origin: 'https://example.com' },
        body,
      })
    ).status,
    403,
  );
  assert.equal((await fetch(`${server.origin}/rpc`, { method: 'POST', headers, body: '{}' })).status, 400);
});
test('agent capabilities serve only known bundles and frame sources with CORS', async (t) => {
  const directory = temporary(t),
    file = path.join(directory, 'index.html');
  fs.writeFileSync(file, 'local HTML');
  const capability = 'f'.repeat(64);
  const server = await createAgentServer({
    discoveryDirectory: directory,
    dispatch: async () => {
      throw new Error('Tool failed.');
    },
    bundleFile: (token, name) => (token === capability && name === 'index.html' ? file : null),
    frame: async (token, timeMs) => {
      assert.equal(token, capability);
      assert.equal(timeMs, 123);
      return Buffer.from('pixels');
    },
  });
  t.after(() => server.dispose());
  assert.equal(await (await fetch(`${server.origin}/html/${capability}/index.html`)).text(), 'local HTML');
  assert.equal((await fetch(`${server.origin}/html/${'a'.repeat(64)}/index.html`)).status, 404);
  const frame = await fetch(`${server.origin}/frame/${capability}?timeMs=123`, {
    headers: { Origin: 'http://localhost:6500' },
  });
  assert.equal(frame.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal(await frame.text(), 'pixels');
  const [instance] = discoverAgents(directory);
  const failed = await fetch(`${server.origin}/rpc`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${instance.token}` },
    body: JSON.stringify({ version: 1, tool: 'bad' }),
  });
  assert.equal(failed.status, 400);
  assert.equal((await failed.json()).error, 'Tool failed.');
  await server.dispose();
  assert.deepEqual(discoverAgents(directory), []);
});
test('discovery ignores stale, invalid and symlink entries and uses OS config directories', (t) => {
  const directory = temporary(t);
  fs.writeFileSync(path.join(directory, '1.json'), '{}');
  fs.writeFileSync(
    path.join(directory, '2.json'),
    JSON.stringify({ version: 1, pid: 2147483647, port: 1234, token: 'f'.repeat(64) }),
  );
  fs.writeFileSync(path.join(directory, '3.json'), 'x'.repeat(4097));
  fs.symlinkSync(path.join(directory, '1.json'), path.join(directory, '4.json'));
  assert.deepEqual(discoverAgents(directory), []);
  assert.equal(
    agentDirectory({ platform: 'linux', env: { XDG_CONFIG_HOME: '/custom' }, home: '/home/user' }),
    '/custom/Beam Agents',
  );
  assert.ok(
    agentDirectory({ platform: 'darwin', env: {}, home: '/home/user' }).includes('Library/Application Support'),
  );
  assert.ok(agentDirectory({ platform: 'win32', env: { APPDATA: '/custom' }, home: '/home/user' }).includes('/custom'));
});

function bridgeFixture(t) {
  const handlers = new Map(),
    listeners = new Map();
  const sender = new EventEmitter();
  sender.id = 1;
  sender.send = (...message) => {
    sender.message = message;
  };
  let owned = { projectId: 'project' };
  const bridge = createDocumentBridge({
    ipcMain: {
      handle: (channel, callback) => handlers.set(channel, callback),
      on: (channel, callback) => listeners.set(channel, callback),
    },
    editorWindow: { contextFor: () => owned },
  });
  t.after(() => bridge.dispose());
  const register = (context) => handlers.get('authoring:register')({ sender }, context);
  const reply = (source, id, response) => listeners.get('authoring:reply')({ sender: source }, id, response);
  return {
    bridge,
    sender,
    register,
    reply,
    change: () => {
      owned = { projectId: 'other' };
    },
  };
}
test('document bridge rejects forged identity and forwards replies only from the owning editor', async (t) => {
  const { bridge, sender, register, reply } = bridgeFixture(t);
  assert.throws(() => register({ projectId: 'other', kind: 'video' }), /belong/);
  assert.throws(() => register({ projectId: 'project', kind: 'image' }), /belong/);
  register({ projectId: 'project', kind: 'video', name: 'Test' });
  assert.deepEqual(bridge.list(), [{ projectId: 'project', kind: 'video', name: 'Test' }]);
  const waiting = bridge.request('project', { version: 1, id: 'snapshot', method: 'snapshot' });
  const [, message] = sender.message;
  reply({ id: 99 }, message.id, { ok: false });
  reply(sender, message.id, { ok: true });
  assert.deepEqual(await waiting, { ok: true });
  assert.throws(() => bridge.contextFor({ id: 99 }), /No active/);
});
test('document bridge releases pending requests on unregister and rejects stale contexts', async (t) => {
  const { bridge, register, change } = bridgeFixture(t);
  assert.throws(() => bridge.request('project', {}), /Open the project/);
  register({ projectId: 'project', kind: 'video', name: 'Test' });
  const waiting = bridge.request('project', {});
  register(null);
  await assert.rejects(waiting, /closed/);
  assert.deepEqual(bridge.list(), []);
  register({ projectId: 'project', kind: 'video', name: 'Test' });
  change();
  assert.deepEqual(bridge.list(), []);
  assert.throws(() => bridge.context('project'), /Open the project/);
});
test('document bridge bounds unanswered requests', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { bridge, register } = bridgeFixture(t);
  register({ projectId: 'project', kind: 'video', name: 'Test' });
  const waiting = bridge.request('project', {});
  t.mock.timers.tick(30000);
  await assert.rejects(waiting, /current revision/);
});

function filesFixture(t) {
  const root = temporary(t),
    source = path.join(root, 'input'),
    bundle = path.join(root, 'bundle'),
    project = path.join(root, 'project');
  for (const directory of [source, bundle, project]) fs.mkdirSync(directory);
  fs.writeFileSync(path.join(source, 'index.html'), '<html>source</html>');
  fs.writeFileSync(path.join(source, 'main.ts'), 'const a: number = 1');
  fs.writeFileSync(path.join(bundle, 'index.html'), '<html>compiled</html>');
  const files = createHtmlFiles({
    projectStore: { directoryFor: () => project },
    screenshotStore: { directoryFor: () => project },
  });
  return {
    files,
    source,
    bundle,
    project,
    context: { projectId: 'project', kind: 'video' },
    input: { html: html(), sourceDirectory: source, bundleDirectory: bundle },
  };
}
test('HTML publication freezes source and output while preserving previous revisions', (t) => {
  const { files, context, input, source } = filesFixture(t);
  const descriptor = files.stage(context, input);
  fs.writeFileSync(path.join(source, 'main.ts'), 'changed');
  assert.equal(fs.readFileSync(files.fileFor(context, descriptor, 'main.ts', 'source'), 'utf8'), 'const a: number = 1');
  assert.equal(fs.readFileSync(files.fileFor(context, descriptor, 'index.html'), 'utf8'), '<html>compiled</html>');
  assert.throws(() => files.stage(context, input), /EEXIST/);
  const second = { ...descriptor, revision: randomUUID() };
  files.stage(context, { ...input, html: second });
  assert.notEqual(files.directoryFor(context, descriptor), files.directoryFor(context, second));
});
test('HTML files reject path escapes, symlink sources and symlink destinations', (t) => {
  const { files, context, input, source, project } = filesFixture(t);
  fs.symlinkSync(path.join(source, 'main.ts'), path.join(source, 'unsafe.ts'));
  assert.throws(() => files.stage(context, input), /symbolic links/);
  assert.ok(!fs.existsSync(path.join(project, 'html', input.html.id, input.html.revision)));
  fs.unlinkSync(path.join(source, 'unsafe.ts'));
  const descriptor = files.stage(context, input);
  assert.throws(() => files.fileFor(context, descriptor, '../../outside'), /Invalid composition path/);
  fs.symlinkSync(path.join(source, 'main.ts'), path.join(files.directoryFor(context, descriptor), 'dist/unsafe.ts'));
  assert.throws(() => files.fileFor(context, descriptor, 'unsafe.ts'), /Invalid composition file/);
});
test('HTML staging rejects animation for stills, missing output and oversized trees without publishing them', (t) => {
  const { files, context, input, source, bundle } = filesFixture(t);
  assert.throws(
    () => files.stage({ ...context, kind: 'image' }, { ...input, html: { ...input.html, durationMs: 1 } }),
    /static/,
  );
  fs.unlinkSync(path.join(bundle, 'index.html'));
  assert.throws(() => files.stage(context, input), /ENOENT/);
  fs.writeFileSync(path.join(bundle, 'index.html'), 'compiled');
  const large = fs.openSync(path.join(source, 'large.bin'), 'w');
  fs.ftruncateSync(large, 128 * 1024 * 1024 + 1);
  fs.closeSync(large);
  assert.throws(() => files.stage(context, input), /limit/);
});
