const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createDesktopGpuMonitor } = require('../apps/desktop/electron/export/gpu-monitor.cjs');
const { registerExportIpc } = require('../apps/desktop/electron/export/export-ipc.cjs');

test(
  'collects actual native protocol responses for only the Electron GPU process',
  { skip: process.platform === 'win32' },
  async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'beam-gpu-native-'));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const log = path.join(directory, 'requests.jsonl'),
      executable = path.join(directory, 'native');
    await fs.writeFile(
      executable,
      `#!/usr/bin/env node
const fs=require('node:fs');
require('node:readline').createInterface({input:process.stdin}).on('line',line=>{
const request=JSON.parse(line);fs.appendFileSync(${JSON.stringify(log)},line+'\\n');
process.stdout.write(JSON.stringify({requestId:request.id,ok:true,result:{version:1,status:'sampled',source:'linux-drm',scope:'process',devices:[{id:'pci-0',name:'GPU',engines:[{name:'render',busyPercent:42}]}]}})+'\\n');});`,
      { mode: 0o755 },
    );
    const monitor = createDesktopGpuMonitor({
      app: {
        getPath: () => directory,
        getAppMetrics: () => [
          { pid: 42, type: 'GPU' },
          { pid: 17, type: 'Renderer' },
        ],
      },
      captureEngine: { resolveExecutable: () => executable },
    });
    const summary = await monitor.finish();
    assert.equal(summary.busiestEngine.median, 42);
    const requests = (await fs.readFile(log, 'utf8')).trim().split('\n').map(JSON.parse);
    assert.deepEqual(requests[0].processIds, [42]);
    assert.equal(requests.at(-1).command, 'stop');
  },
);

test('reports platform capability failures instead of failing an export', async () => {
  const monitor = createDesktopGpuMonitor({
    app: { getPath: () => os.tmpdir(), getAppMetrics: () => [] },
    captureEngine: {
      resolveExecutable: () => {
        throw new Error('Native backend missing');
      },
    },
  });
  const summary = await monitor.finish();
  assert.equal(summary.status, 'unavailable');
  assert.equal(summary.busiestEngine, null);
  assert.match(summary.issues[0].reason, /Native backend missing/);
});

for (const operation of ['finalize', 'abort', 'window-close'])
  test(`stops job-owned GPU collection on export ${operation}`, async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'beam-gpu-job-'));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const handlers = new Map(),
      summary = { version: 1, status: 'available', samples: 2 };
    let stopped = 0;
    const registration = registerExportIpc({
      ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
      dialog: { showSaveDialog: async () => ({ filePath: path.join(directory, 'output.mp4') }) },
      BrowserWindow: { fromWebContents: () => ({}) },
      createGpuMonitor: () => ({
        finish: async () => {
          stopped++;
          return summary;
        },
      }),
    });
    const event = { sender: { id: 42 } };
    const opened = await handlers.get('export:begin')(event, { format: 'mp4' });
    if (operation === 'window-close') {
      registration.cleanupWindow(event.sender);
      for (let retry = 0; retry < 10 && stopped === 0; retry++) await new Promise((resolve) => setImmediate(resolve));
    } else {
      const response = await handlers.get(`export:${operation}`)(event, { jobId: opened.jobId });
      assert.deepEqual(response.gpuUsage, summary);
    }
    assert.equal(stopped, 1);
  });
