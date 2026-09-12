const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const { createFileClipboard } = require('../electron/clipboard/file-clipboard.cjs');

function createSpawnFixture() {
  const calls = [];
  const spawn = (command, args, options) => {
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stderr = new PassThrough();
    child.input = [];
    child.killCalls = 0;
    child.stdin.on('data', (chunk) => child.input.push(Buffer.from(chunk)));
    child.kill = () => {
      child.killCalls += 1;
      return true;
    };
    calls.push({ command, args, options, child });
    return child;
  };

  return { calls, spawn };
}

function inputText(child) {
  return Buffer.concat(child.input).toString('utf8');
}

test('publishes a Wayland file as a native URI list and resolves on acquisition exit', async () => {
  const { calls, spawn } = createSpawnFixture();
  const env = { WAYLAND_DISPLAY: 'wayland-0', DISPLAY: ':0', HOME: '/fake-home' };
  const file = "/tmp/Quick Snip 漢字;$(touch should-not-run) ' #1?.png";
  const clipboard = createFileClipboard({ platform: 'linux', env, spawn });

  const pending = clipboard.copyFile(file);
  assert.equal(calls.length, 1);
  const [{ command, args, options, child }] = calls;
  assert.equal(command, 'wl-copy');
  assert.deepEqual(args, ['--type', 'text/uri-list']);
  assert.strictEqual(options.env, env);
  assert.deepEqual(options.stdio, ['pipe', 'ignore', 'pipe']);
  assert.equal(options.windowsHide, true);
  assert.equal(options.detached, true);
  assert.equal(inputText(child), `${pathToFileURL(file).href}\r\n`);
  assert.ok(!args.some((argument) => argument.includes(file)));

  // The selection owner can retain stderr after acquiring the clipboard.
  // Completion must depend on `exit`, not the later `close` event.
  child.emit('exit', 0, null);
  assert.deepEqual(await pending, { native: true, fallback: null });
  assert.equal(calls.length, 1);
  assert.equal(child.stdin.destroyed, true);
  assert.equal(child.stderr.destroyed, true);
});

test('publishes an X11 file as text/uri-list using xclip', async () => {
  const { calls, spawn } = createSpawnFixture();
  const env = { DISPLAY: ':1' };
  const file = '/tmp/Quick Snip café.png';
  const pending = createFileClipboard({ platform: 'linux', env, spawn }).copyFile(file);

  assert.equal(calls.length, 1);
  const [{ command, args, options, child }] = calls;
  assert.equal(command, 'xclip');
  assert.deepEqual(args, ['-selection', 'clipboard', '-target', 'text/uri-list', '-in', '-silent']);
  assert.strictEqual(options.env, env);
  assert.equal(options.detached, true);
  assert.equal(inputText(child), `${pathToFileURL(file).href}\r\n`);

  child.emit('exit', 0, null);
  assert.deepEqual(await pending, { native: true, fallback: null });
});

test('sends a Unicode Windows path as stdin data to a static PowerShell script', async () => {
  const { calls, spawn } = createSpawnFixture();
  const file = "C:\\Users\\Ada\\Quick Snip 漢字;$(Write-Output 'injected'); $env:PATH.png";
  const pending = createFileClipboard({ platform: 'win32', env: { PATH: 'fake' }, spawn }).copyFile(file);

  assert.equal(calls.length, 1);
  const [{ command, args, options, child }] = calls;
  assert.equal(command, 'powershell.exe');
  assert.deepEqual(args.slice(0, 4), ['-NoProfile', '-NonInteractive', '-STA', '-Command']);
  assert.match(args[4], /SetFileDropList/);
  assert.match(args[4], /\[Console\]::In\.ReadToEnd\(\)/);
  assert.ok(!args[4].includes(file));
  assert.ok(!args.includes(file));
  assert.equal(inputText(child), Buffer.from(file, 'utf8').toString('base64'));
  assert.equal(options.detached, false);

  child.emit('exit', 0, null);
  assert.deepEqual(await pending, { native: true, fallback: null });
});

test('publishes a macOS public.file-url without starting a helper process', async () => {
  const { calls, spawn } = createSpawnFixture();
  const writes = [];
  const clipboard = { writeBuffer: (...args) => writes.push(args) };
  const file = '/tmp/Quick Snip café #1.png';

  const result = await createFileClipboard({ platform: 'darwin', clipboard, spawn }).copyFile(file);

  assert.deepEqual(writes, [['public.file-url', Buffer.from(pathToFileURL(file).href)]]);
  assert.equal(calls.length, 0);
  assert.deepEqual(result, { native: true, fallback: null });
});

test('rejects a helper failure with its stderr diagnostic', async () => {
  const { calls, spawn } = createSpawnFixture();
  const pending = createFileClipboard({
    platform: 'linux',
    env: { WAYLAND_DISPLAY: 'wayland-0' },
    spawn,
  }).copyFile('/tmp/capture.png');
  const { child } = calls[0];
  child.stderr.write('compositor refused clipboard ownership');
  child.emit('exit', 7, null);

  await assert.rejects(pending, /Clipboard publication failed \(7\): compositor refused clipboard ownership/);
  assert.equal(child.stdin.destroyed, true);
  assert.equal(child.stderr.destroyed, true);
});

test('reports a missing Linux clipboard helper', async () => {
  const { calls, spawn } = createSpawnFixture();
  const pending = createFileClipboard({
    platform: 'linux',
    env: { WAYLAND_DISPLAY: 'wayland-0' },
    spawn,
  }).copyFile('/tmp/capture.png');
  const { child } = calls[0];
  const error = Object.assign(new Error('spawn wl-copy ENOENT'), { code: 'ENOENT' });
  child.emit('error', error);

  await assert.rejects(pending, /requires wl-copy\. Install wl-clipboard/);
});

test('kills a helper and rejects when clipboard acquisition times out', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { calls, spawn } = createSpawnFixture();
    const pending = createFileClipboard({
      platform: 'linux',
      env: { WAYLAND_DISPLAY: 'wayland-0' },
      spawn,
    }).copyFile('/tmp/capture.png');

    await t.mock.timers.tick(10_000);
    await assert.rejects(pending, /Clipboard publication with wl-copy timed out/);
    assert.equal(calls[0].child.killCalls, 1);
    assert.equal(calls[0].child.stdin.destroyed, true);
    assert.equal(calls[0].child.stderr.destroyed, true);
  } finally {
    t.mock.timers.reset();
  }
});

test('clears the timeout after success and does not start a later copier', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { calls, spawn } = createSpawnFixture();
    const pending = createFileClipboard({
      platform: 'linux',
      env: { WAYLAND_DISPLAY: 'wayland-0' },
      spawn,
    }).copyFile('/tmp/capture.png');
    const { child } = calls[0];

    child.emit('exit', 0, null);
    assert.deepEqual(await pending, { native: true, fallback: null });
    await t.mock.timers.tick(20_000);

    assert.equal(child.killCalls, 0);
    assert.equal(calls.length, 1);
  } finally {
    t.mock.timers.reset();
  }
});

test('rejects invalid paths and Linux sessions without a clipboard display', async () => {
  const { calls, spawn } = createSpawnFixture();
  const clipboard = createFileClipboard({ platform: 'linux', env: {}, spawn });

  await assert.rejects(clipboard.copyFile(''), /Invalid clipboard file/);
  await assert.rejects(clipboard.copyFile('/tmp/bad\0path'), /Invalid clipboard file/);
  await assert.rejects(clipboard.copyFile('/tmp/capture.png'), /requires a Wayland or X11 session/);
  assert.equal(calls.length, 0);
});
