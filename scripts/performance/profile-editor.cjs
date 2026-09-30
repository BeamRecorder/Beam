// Profile a real project in a fresh, hidden Electron process. Original files are never opened for writing.
// BEAM_EDITOR_PROFILE_SOURCE points to the project folder; build first and run with --ozone-platform=x11 on X11.
const { app, BrowserWindow, ipcMain } = require('electron');
const { performance } = require('node:perf_hooks');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
// Suppress presentation only in this harness, including auxiliary windows.
// The open promise measures presentation readiness rather than an onscreen show.
BrowserWindow.prototype.show = () => undefined;
BrowserWindow.prototype.showInactive = () => undefined;
BrowserWindow.prototype.focus = () => undefined;
const root = process.env.BEAM_EDITOR_PROFILE_ROOT || path.resolve(__dirname, '../..');
const source = process.env.BEAM_EDITOR_PROFILE_SOURCE;
if (!source) throw new Error('BEAM_EDITOR_PROFILE_SOURCE must name a real project folder.');
const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-editor-profile-'));
const projectRoot = path.join(isolated, 'videos/Beam/user/projects');
const destination = path.join(projectRoot, 'studio', path.basename(source));
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.cpSync(source, destination, { recursive: true, dereference: true });
const sourceRoot = path.dirname(path.dirname(source));
// Include the real catalogue size without copying unrelated recordings.
for (const category of ['studio', 'instant']) {
  for (const name of fs.readdirSync(path.join(sourceRoot, category))) {
    const manifest = path.join(sourceRoot, category, name, 'project.json');
    const target = path.join(projectRoot, category, name, 'project.json');
    if (!fs.existsSync(manifest) || fs.existsSync(target)) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(manifest, target);
  }
}
const manifestFile = path.join(destination, 'project.json');
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8').split(source).join(destination));
fs.writeFileSync(manifestFile, JSON.stringify(manifest));
const { defaults } = require(path.join(root, 'electron/preferences/preferences-store.cjs'));
const preferences = defaults();
preferences.onboardingCompleted = true;
preferences.devices = { cameraId: 'off', micId: 'no-audio', systemAudioMode: 'off' };
fs.writeFileSync(path.join(isolated, 'videos/Beam/user/preferences.json'), JSON.stringify(preferences));
app.setPath('userData', path.join(isolated, 'chromium'));
app.setPath('videos', path.join(isolated, 'videos'));
Object.defineProperty(app, 'isPackaged', { value: true });
app.getVersion = () => require(path.join(root, 'package.json')).version;
delete process.env.BEAM_DEVELOPMENT_INSTANCE;
delete process.env.BEAM_DEVTOOLS;
const result = { fixture: path.basename(source), hidden: true, ipc: [], stages: [], media: [] };
let openingAt = 0;
let editor;
let finish;
const originalHandle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, fn) =>
  originalHandle(channel, async (event, ...args) => {
    const start = performance.now();
    try {
      return await fn(event, ...args);
    } finally {
      if (openingAt) result.ipc.push({ channel, duration: performance.now() - start, at: start - openingAt });
    }
  });
ipcMain.on('editor:loading-stage', (_, stage) => result.stages.push({ stage, at: performance.now() - openingAt }));
ipcMain.on('editor:ready', () => result.stages.push({ stage: 'native-ready', at: performance.now() - openingAt }));
app.on('browser-window-created', (_, window) => {
  window.setSkipTaskbar(true);
  window.webContents.setBackgroundThrottling(false);
  window.webContents.once('dom-ready', () => {
    if (!window.webContents.getURL().includes('/editor.html')) return;
    void window.webContents
      .executeJavaScript(`{
      window.__beamProfileLongTasks = [];
      new PerformanceObserver(list => window.__beamProfileLongTasks.push(...list.getEntries().map(entry => entry.duration)))
        .observe({type:'longtask', buffered:true});
    }`)
      .catch(() => undefined);
  });
  if (process.env.BEAM_EDITOR_PROFILE_TRACE) {
    window.webContents.debugger.attach('1.3');
    window.webContents.debugger.on('message', (_, method, params) => {
      if (method === 'Runtime.consoleAPICalled' && openingAt) {
        const args = params.args.map((arg) => arg.value ?? arg.preview ?? arg.description);
        result.media.push({ at: performance.now() - openingAt, args });
      }
    });
    void window.webContents.debugger.sendCommand('Runtime.enable');
    void window.webContents.debugger
      .sendCommand('Profiler.enable')
      .then(() => window.webContents.debugger.sendCommand('Profiler.start'));
  }

  window.webContents.once('did-finish-load', async () => {
    const role = new URL(window.webContents.getURL()).pathname.split('/').at(-1);
    if (role === 'editor.html') {
      editor = window;
      window.webContents.on('console-message', (details) => {
        if (details.message.startsWith('[Beam media:'))
          result.media.push({ at: performance.now() - openingAt, text: details.message });
      });
      return;
    }
    if (role !== 'index.html') return;
    try {
      await window.webContents.executeJavaScript(`new Promise(resolve => {
        const ready = () => performance.getEntriesByName('beam:renderer-bootstrap').length > 0;
        if (ready()) return resolve();
        const observer = new PerformanceObserver(() => { if (ready()) { observer.disconnect(); resolve(); } });
        observer.observe({type:'measure', buffered:true});
      })`);
      await window.webContents.executeJavaScript('window.capture.discover()');
      openingAt = performance.now();
      await window.webContents.executeJavaScript(`window.capture.openEditor(${JSON.stringify(manifest.projectId)})`);
      result.presented = performance.now() - openingAt;
      if (BrowserWindow.getAllWindows().some((window) => window.isVisible()))
        throw new Error('A profiling window became visible.');
      result.renderer = await editor.webContents.executeJavaScript(`new Promise((resolve, reject) => {
        const deadline = performance.now() + 15000;
        const poll = () => {
          const ready = document.querySelector('.editor-page') && !document.querySelector('.is-loading-covered') && !document.querySelector('.editor-project-loading-overlay');
          if (ready) return resolve({ at: performance.now(), longTasks:window.__beamProfileLongTasks, resources: performance.getEntriesByType('resource').map(r=>({name:r.name.split('/').at(-1),duration:r.duration,bytes:r.decodedBodySize})), error:document.querySelector('.preview-error')?.textContent || null });
          if (performance.now() > deadline) return reject(new Error('Preview did not become visible.'));
          setTimeout(poll, 10);
        }; poll();
      })`);
      result.playbackSettled = performance.now() - openingAt;
      result.process = app.getAppMetrics().find((metric) => metric.pid === editor.webContents.getOSProcessId());
      result.success = !result.renderer.error && !result.media.some((item) => item.text?.includes('Playback failed.'));
      if (process.env.BEAM_EDITOR_PROFILE_TRACE) {
        const cpu = await editor.webContents.debugger.sendCommand('Profiler.stop');
        fs.writeFileSync(process.env.BEAM_EDITOR_PROFILE_TRACE, JSON.stringify(cpu.profile));
      }
      finish();
    } catch (error) {
      result.error = String(error);
      finish();
    }
  });
});
finish = () => {
  const output = process.env.BEAM_EDITOR_PROFILE_OUTPUT || path.join(isolated, 'result.json');
  fs.writeFileSync(output, JSON.stringify(result, null, 2));
  console.log(
    'EDITOR PROFILE',
    JSON.stringify({
      output,
      presented: result.presented,
      playbackSettled: result.playbackSettled,
      error: result.error,
      success: result.success,
    }),
  );
  app.quit();
};
require(path.join(root, 'electron/main.cjs'));
setTimeout(() => {
  result.error = 'Profile deadline';
  finish();
}, 25000).unref();
