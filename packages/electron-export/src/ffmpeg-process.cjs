const { spawn } = require('node:child_process');

function startProcess(executable, args, { stdio, timeoutMs = 30_000, spawnImpl = spawn } = {}) {
  const child = spawnImpl(executable, args, { stdio: stdio ?? ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  let settled = false;
  let readyResolve;
  let readyReject;
  const ready = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  void ready.catch(() => undefined);
  const completion = new Promise((resolve, reject) => {
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    timer.unref?.();
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        readyReject(error);
        reject(error);
      } else {
        readyReject(new Error('FFmpeg exited before becoming ready.'));
        resolve({ stdout, stderr });
      }
    };
    child.stdout?.on('data', (data) => {
      stdout = (stdout + data.toString()).slice(-65_536);
      if (stdout.includes('BEAM_FFMPEG_READY\n')) readyResolve();
    });
    child.stderr?.on('data', (data) => {
      stderr = (stderr + data.toString()).slice(-16_384);
    });
    child.once('error', finish);
    child.once('close', (code, signal) =>
      finish(
        code === 0
          ? null
          : new Error(`FFmpeg GPU export failed (${signal ?? code}): ${stderr.trim() || 'no native diagnostic'}`),
      ),
    );
  });
  void completion.catch(() => undefined);
  return {
    ready,
    completion,
    cancel: () => {
      if (!settled) child.kill('SIGKILL');
    },
  };
}

module.exports = { startProcess };
