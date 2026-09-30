// Run with Electron after building the desktop bundle. All user data is isolated.
// The region trial uses Quick Snip selection so no Portal permission is requested.
const { app, BrowserWindow, ipcMain } = require('electron');
const { performance } = require('node:perf_hooks');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = process.env.BEAM_WINDOW_PROFILE_ROOT || path.resolve(__dirname, '../..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-window-profile-'));
const { defaults } = require(path.join(root, 'electron/preferences/preferences-store.cjs'));
const preferences = defaults();
preferences.onboardingCompleted = true;
preferences.devices = { cameraId: 'off', micId: 'no-audio', systemAudioMode: 'off' };
fs.mkdirSync(path.join(profile, 'videos/Beam/user'), { recursive: true });
fs.writeFileSync(path.join(profile, 'videos/Beam/user/preferences.json'), JSON.stringify(preferences));
app.setPath('userData', `${profile}/chromium`);
app.setPath('videos', `${profile}/videos`);
Object.defineProperty(app, 'isPackaged', { value: true });
app.getVersion = () => require(path.join(root, 'package.json')).version;
if (!process.env.BEAM_CAPTURE_ENGINE) {
  const { resolveCargoTargetDirectory } = require(path.join(root, 'electron/capture/cargo-build-paths.cjs'));
  const target = resolveCargoTargetDirectory(root);
  const binary = process.platform === 'win32' ? 'capture-engine.exe' : 'capture-engine';
  process.env.BEAM_CAPTURE_ENGINE = path.join(target, 'debug', binary);
}
delete process.env.BEAM_DEVELOPMENT_INSTANCE;
const result = { windows: [], native: [], ipc: [], transitions: [] };
const states = new Map();
const readyAuxiliary = new Set();
const auxiliaryWaiters = new Map();
ipcMain.on('teleprompter:ready', ({ sender }) => {
  readyAuxiliary.add(sender);
  auxiliaryWaiters.get(sender)?.();
  auxiliaryWaiters.delete(sender);
});
let entry;
let fixtureProject;
app.once('ready', () => (result.appReady = performance.now() - entry));
const originalHandle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, fn) =>
  originalHandle(channel, async (event, ...args) => {
    const start = performance.now();
    try {
      return await fn(event, ...args);
    } finally {
      result.ipc.push({
        channel,
        command: channel === 'capture:request' ? args[0] : undefined,
        duration: performance.now() - start,
        finished: performance.now() - entry,
      });
    }
  });
const { CaptureEngine } = require(`${root}/electron/capture/capture-engine.cjs`);
const request = CaptureEngine.prototype.request;
CaptureEngine.prototype.request = async function (command, ...args) {
  const start = performance.now();
  try {
    return await request.call(this, command, ...args);
  } finally {
    result.native.push({ command, duration: performance.now() - start, finished: performance.now() - entry });
  }
};
app.on('browser-window-created', (_, win) => {
  const state = { created: performance.now() - entry };
  states.set(win, state);
  result.windows.push(state);
  win.once('ready-to-show', () => (state.nativeReady = performance.now() - entry));
  win.once('show', () => (state.firstShow = performance.now() - entry));
  win.webContents.once('did-finish-load', async () => {
    state.loaded = performance.now() - entry;
    state.role =
      new URL(win.webContents.getURL()).pathname.split('/').at(-1) + (new URL(win.webContents.getURL()).search || '');
    if (state.role !== 'index.html') return;
    try {
      result.renderer = await win.webContents.executeJavaScript(`new Promise(resolve=>{
        const finish=()=>{const mark=performance.getEntriesByName('beam:renderer-bootstrap').at(-1); if(!mark)return false;
          resolve({bootstrap:mark.duration,bootstrapEnd:mark.startTime+mark.duration,paint:performance.getEntriesByType('paint').map(p=>({name:p.name,start:p.startTime})),resourceBytes:performance.getEntriesByType('resource').reduce((n,r)=>n+r.decodedBodySize,0)});return true;};
        if(finish())return; const observer=new PerformanceObserver(()=>{if(finish())observer.disconnect();});observer.observe({type:'measure',buffered:true});})`);
      result.hudMounted = performance.now() - entry;
      await win.webContents.executeJavaScript('window.capture.discover()');
      result.captureAvailable = performance.now() - entry;
      const transition = async (name, script) => {
        const start = performance.now();
        await win.webContents.executeJavaScript(script);
        result.transitions.push({ name, duration: performance.now() - start });
      };
      await transition('settings-open', 'window.capture.openHudSettings()');
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes('panel=settings'))
        ?.close();
      await transition('projects-open', 'window.capture.openHudProjects()');
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes('panel=projects'))
        ?.close();
      const tele = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('teleprompter.html'));
      const start = performance.now();
      if (tele) {
        const showing = new Promise((resolve) => tele.once('show', resolve));
        await win.webContents.executeJavaScript('window.capture.showTeleprompter()');
        await showing;
        result.transitions.push({ name: 'teleprompter-show', duration: performance.now() - start });
        await win.webContents.executeJavaScript('window.capture.hideTeleprompter()');
      }
      const countdown = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('countdown.html'));
      if (countdown) {
        await transition('countdown-show', 'window.capture.setCountdown(3)');
        result.countdownText = await countdown.webContents.executeJavaScript(
          'document.querySelector(".countdown")?.textContent',
        );
        await win.webContents.executeJavaScript('window.capture.setCountdown(null)');
      }
      await transition('editor-open', `window.capture.openEditor(${JSON.stringify(fixtureProject.id)})`);
      const editor = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('editor.html'));
      result.editorError = await editor.webContents.executeJavaScript(
        'document.querySelector(".editor-window-state")?.textContent || null',
      );
      const returning = new Promise((resolve) => win.once('show', resolve));
      const returningAt = performance.now();
      await editor.webContents.executeJavaScript('window.capture.showHud()');
      await returning;
      result.transitions.push({ name: 'editor-to-hud', duration: performance.now() - returningAt });
      const regionShown = new Promise((resolve) =>
        app.on('browser-window-created', (_, target) =>
          target.once('show', () => {
            if (target.webContents.getURL().includes('screen-region.html')) resolve(target);
          }),
        ),
      );
      const selectingAt = performance.now();
      const selecting = win.webContents.executeJavaScript(
        'window.capture.selectScreenRegion({context:"quick-snip",region:null})',
      );
      const region = await regionShown;
      result.transitions.push({ name: 'region-select-without-portal', duration: performance.now() - selectingAt });
      await region.webContents.executeJavaScript('window.capture.cancelScreenRegion()');
      await selecting;
      // Finish the return-to-HUD preparation before shutdown disables new IPC.
      await Promise.all(
        BrowserWindow.getAllWindows()
          .filter((target) => /\/teleprompter\.html/.test(target.webContents.getURL()))
          .map((target) =>
            readyAuxiliary.has(target.webContents)
              ? Promise.resolve()
              : new Promise((resolve) => auxiliaryWaiters.set(target.webContents, resolve)),
          ),
      );
      result.profileDirectory = profile;
      console.log('PROFILE', JSON.stringify(result));
      fs.writeFileSync(
        process.env.BEAM_WINDOW_PROFILE_OUTPUT || path.join(profile, 'profile.json'),
        JSON.stringify(result, null, 2),
      );
      app.quit();
    } catch (error) {
      console.error('PROFILE FAILED', error);
      process.exitCode = 1;
      app.quit();
    }
  });
});
entry = performance.now();
require(`${root}/electron/main.cjs`);
result.mainModules = performance.now() - entry;
const { createProjectStore } = require(`${root}/electron/projects/project-store.cjs`);
fixtureProject = createProjectStore(`${profile}/videos/Beam/user/projects`, { category: 'studio' }).create({
  name: 'Performance fixture',
});
setTimeout(() => {
  console.error('PROFILE TIMEOUT');
  process.exitCode = 1;
  app.quit();
}, 20000).unref();
