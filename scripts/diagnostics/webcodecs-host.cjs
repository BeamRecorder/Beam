const { app, BrowserWindow } = require('electron');
const http = require('node:http');
const { join } = require('node:path');
const { configureChromiumFeatures } = require('../../apps/desktop/electron/lifecycle/chromium-features.cjs');
const { probeFrames } = require('./webcodecs-frame-probe.cjs');

const settings = JSON.parse(process.argv.at(-1));
app.setPath('userData', join(process.env.BEAM_DIAGNOSTIC_DIRECTORY, 'profile'));
configureChromiumFeatures(app);
const gpuCrashes = [];
app.on('child-process-gone', (_event, details) => {
  if (details.type === 'GPU') gpuCrashes.push({ reason: details.reason, exitCode: details.exitCode });
});
const deadline = setTimeout(() => app.exit(2), 15_000);

app
  .whenReady()
  .then(async () => {
    const server = http.createServer((_request, response) => {
      response.setHeader('Content-Security-Policy', "default-src 'self'; object-src 'none'; frame-src 'none'");
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end('<!doctype html><title>Beam WebCodecs diagnostic</title>');
    });
    let window;
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      window = new BrowserWindow({
        show: false,
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          backgroundThrottling: false,
        },
      });
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
      await window.loadURL(`http://127.0.0.1:${server.address().port}`);
      const result = await window.webContents.executeJavaScript(
        `(${probeFrames.toString()})(${JSON.stringify(settings.profile)},${JSON.stringify(settings.input)},${JSON.stringify(settings.acceleration)})`,
      );
      // A GPU-process-gone event can follow the WebCodecs error callback.
      await new Promise((resolve) => setTimeout(resolve, 100));
      console.log(
        `BEAM_WEBCODECS_RESULT=${JSON.stringify({
          ...result,
          versions: { electron: process.versions.electron, chromium: process.versions.chrome },
          gpuFeatures: app.getGPUFeatureStatus(),
          gpuCrashes,
        })}`,
      );
    } catch (error) {
      console.error(String(error));
      process.exitCode = 1;
    } finally {
      clearTimeout(deadline);
      if (window && !window.isDestroyed()) window.destroy();
      server.close();
      app.quit();
    }
  })
  .catch((error) => {
    console.error(String(error));
    app.exit(1);
  });
