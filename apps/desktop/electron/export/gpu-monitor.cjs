const { NativeCaptureClient } = require('@beam/native-client');
const { createGpuMonitor } = require('@beam/system-metrics/node/gpu-monitor');

/** A separate native process prevents diagnostics from queuing behind capture commands. */
function createDesktopGpuMonitor({ app, captureEngine }) {
  const client = new NativeCaptureClient({
    executable: () => captureEngine.resolveExecutable(),
    workingDirectory: () => app.getPath('userData'),
  });
  return createGpuMonitor({
    processIds: () =>
      app
        .getAppMetrics()
        .filter((process) => process.type === 'GPU')
        .map((process) => process.pid),
    sample: (processIds) => client.request('gpu-usage', { processIds }, { timeoutMs: 2000 }),
    dispose: () => client.shutdown(),
  });
}
module.exports = { createDesktopGpuMonitor };
