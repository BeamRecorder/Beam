const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { publishScreenshot } = require('../apps/desktop/electron/screenshot/screenshot-export.cjs');
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0]).buffer;
const fixture = () => {
  let now = 0;
  const services = {
    store: { read: () => ({ name: 'Image' }) },
    nativeImage: { createFromBuffer: () => ({ isEmpty: () => false }) },
    clipboard: { write: async () => {} },
    ClipboardItem: class {
      constructor(data) {
        this.data = data;
      }
    },
    dialog: { showMessageBox: async () => ({ response: 1 }) },
    BrowserWindow: { fromWebContents: () => ({}) },
    outputDirectory: '/tmp',
    clock: () => now++,
  };
  return { services, event: { sender: {} }, input: { id: 'id', bytes: png, format: 'png', copy: true } };
};
test('measures asynchronous clipboard completion and never reports success before it finishes', async () => {
  const { services, event, input } = fixture();
  let finish;
  services.clipboard.write = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  let settled = false;
  const pending = publishScreenshot(services, event, input).then((result) => {
    settled = true;
    return result;
  });
  await Promise.resolve();
  assert.equal(settled, false);
  finish();
  const result = await pending;
  assert.deepEqual(result, {
    status: 'copied',
    path: null,
    timings: { validate: 1, pngDecode: 1, clipboardWrite: 1, total: 7 },
  });
});
test('measures a cancelled replacement and preserves the original file without leaving temporary files', async (t) => {
  const { services, event, input } = fixture();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-screenshot-cancel-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  services.outputDirectory = root;
  fs.writeFileSync(path.join(root, 'Image.png'), 'original');
  const result = await publishScreenshot(services, event, { ...input, copy: false });
  assert.equal(result.status, 'cancelled');
  assert.equal(result.path, null);
  assert.equal(result.timings.fileWrite, 1);
  assert.equal(fs.readFileSync(path.join(root, 'Image.png'), 'utf8'), 'original');
  assert.deepEqual(fs.readdirSync(root), ['Image.png']);
});
test('preserves error semantics while reporting partial native phase timings', async (t) => {
  const { services, event, input } = fixture();
  let logged;
  t.mock.method(console, 'info', (label, report) => {
    logged = { label, report };
  });
  services.clipboard.write = async () => {
    throw new Error('Clipboard denied');
  };
  await assert.rejects(publishScreenshot(services, event, input), /Clipboard denied/);
  assert.equal(logged.label, '[Beam Screenshot publish]');
  assert.equal(logged.report.status, 'error');
  assert.equal(logged.report.timings.clipboardWrite, 1);
  assert.equal(logged.report.error, 'Clipboard denied');
  assert.equal(logged.report.timings.total, 7);
});
