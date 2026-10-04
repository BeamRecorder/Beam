const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { applyHyprlandWindowRules } = require('../apps/desktop/electron/lifecycle/hyprland-window-rules.cjs');

async function fixture(t, respond) {
  const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-hypr-'));
  const env = { XDG_RUNTIME_DIR: runtime, HYPRLAND_INSTANCE_SIGNATURE: 'test_signature' };
  const directory = path.join(runtime, 'hypr', env.HYPRLAND_INSTANCE_SIGNATURE);
  fs.mkdirSync(directory, { recursive: true });
  const calls = [];
  const clients = new Set();
  const server = net.createServer((client) => {
    clients.add(client);
    client.once('close', () => clients.delete(client));
    client.on('error', () => {});
    client.once('data', (data) => {
      calls.push(data.toString());
      respond(client, calls.at(-1));
    });
  });
  await new Promise((resolve) => server.listen(path.join(directory, '.socket.sock'), resolve));
  t.after(async () => {
    for (const client of clients) client.destroy();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(runtime, { force: true, recursive: true });
  });
  return { env, calls };
}

test('modern Hyprland gets one persistent Lua rule with exact overlay matching', async (t) => {
  const f = await fixture(t, (client, command) => {
    if (command === 'j/version') {
      client.write('{"tag":');
      setImmediate(() => client.end('"v0.56.2"}'));
    } else client.end('ok');
  });
  assert.equal(await applyHyprlandWindowRules(f.env, 'linux'), true);
  assert.equal(f.calls.length, 2);
  assert.match(f.calls[1], /^\/eval _G\.beam_overlay_rule = hl.window_rule/);
  assert.match(f.calls[1], /border_size = 0, no_shadow = true/);
  const classPattern = f.calls[1].match(/class = \[\[(.*?)\]\]/)[1];
  const titlePattern = f.calls[1].match(/title = \[\[(.*?)\]\]/)[1];
  assert.equal(new RegExp(classPattern).test('com.beam.app'), true);
  assert.equal(new RegExp(classPattern).test('comXbeamXapp'), false);
  for (const title of ['Beam Recorder', 'Beam Quick Snip', 'Beam Countdown', 'Beam Region Selection']) {
    assert.equal(new RegExp(titlePattern).test(title), true);
  }
  for (const title of [
    'Project - Beam Editor',
    'Beam Editor',
    'Beam Settings',
    'Beam Projects',
    'Beam Mascot Lab',
    'Beam - Welcome',
  ]) {
    assert.equal(new RegExp(titlePattern).test(title), false);
  }
});

test('Hyprland 0.53 and 0.54 use their supported match-based rule syntax', async (t) => {
  const f = await fixture(t, (client, command) => client.end(command === 'j/version' ? '{"tag":"v0.54.3"}' : 'ok'));
  assert.equal(await applyHyprlandWindowRules(f.env, 'linux'), true);
  assert.equal(f.calls.length, 2);
  assert.match(f.calls[1], /^\/keyword windowrule border_size 0, no_shadow on, match:class/);
});

test('older Hyprland sends each legacy command in a separate connection', async (t) => {
  const f = await fixture(t, (client, command) => client.end(command === 'j/version' ? '{"tag":"v0.50.1"}' : 'ok'));
  assert.equal(await applyHyprlandWindowRules(f.env, 'linux'), true);
  assert.equal(f.calls.length, 3);
  assert.match(f.calls[1], /^\/keyword windowrulev2 noborder,/);
  assert.match(f.calls[2], /^\/keyword windowrulev2 noshadow,/);
});

test('invalid sessions and other operating systems do not use compositor IPC', async () => {
  for (const env of [
    {},
    { XDG_RUNTIME_DIR: '/tmp' },
    { XDG_RUNTIME_DIR: 'relative', HYPRLAND_INSTANCE_SIGNATURE: 'sig' },
    { XDG_RUNTIME_DIR: '/tmp', HYPRLAND_INSTANCE_SIGNATURE: '../escape' },
  ]) {
    assert.equal(await applyHyprlandWindowRules(env, 'linux'), false);
  }
  assert.equal(
    await applyHyprlandWindowRules({ XDG_RUNTIME_DIR: '/tmp', HYPRLAND_INSTANCE_SIGNATURE: 'sig' }, 'win32'),
    false,
  );
  assert.equal(
    await applyHyprlandWindowRules({ XDG_RUNTIME_DIR: '/tmp', HYPRLAND_INSTANCE_SIGNATURE: 'sig' }, 'linux'),
    false,
  );
});

test('invalid, oversized or unsupported responses do not install rules', async (t) => {
  for (const response of ['invalid json', '{"tag":"unknown"}', 'x'.repeat(17000)]) {
    const f = await fixture(t, (client) => client.end(response));
    assert.equal(await applyHyprlandWindowRules(f.env, 'linux'), false);
    assert.equal(f.calls.length, 1);
  }
});

test('a compositor rejection stops rule installation', async (t) => {
  const f = await fixture(t, (client, command) => client.end(command === 'j/version' ? '{"tag":"v0.50.1"}' : 'error'));
  assert.equal(await applyHyprlandWindowRules(f.env, 'linux'), false);
  assert.equal(f.calls.length, 2);
});

test('silent IPC is bounded and cannot hold application startup', async (t) => {
  const f = await fixture(t, () => {});
  assert.equal(await applyHyprlandWindowRules(f.env, 'linux', 20), false);
  assert.equal(f.calls.length, 1);
});
