import { spawn } from 'node:child_process';

export function runExportProcess(executable: string, args: string[], env: NodeJS.ProcessEnv) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, {
      env,
      detached: process.platform === 'linux',
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let detail = '';
    let interrupted = false;
    let forceStop: ReturnType<typeof setTimeout> | undefined;
    const terminate = (signal: NodeJS.Signals) => {
      if (!child.pid || process.platform !== 'linux') {
        child.kill(signal);
        return;
      }
      try {
        process.kill(-child.pid, signal);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') child.emit('error', error);
      }
    };
    const interrupt = () => {
      if (interrupted) return;
      interrupted = true;
      terminate('SIGTERM');
      forceStop = setTimeout(() => terminate('SIGKILL'), 5000);
    };
    const deadline = setTimeout(interrupt, 60 * 60 * 1000);
    process.once('SIGINT', interrupt);
    process.once('SIGTERM', interrupt);
    child.stderr?.on('data', (chunk: Buffer) => {
      detail = (detail + chunk.toString()).slice(-16384);
    });
    const cleanup = () => {
      clearTimeout(deadline);
      if (forceStop) clearTimeout(forceStop);
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', interrupt);
    };
    child.once('error', (error) => {
      cleanup();
      reject(error);
    });
    child.once('close', (code) => {
      if (code !== 0 || interrupted) terminate('SIGKILL');
      cleanup();
      if (interrupted) reject(new Error('Export interrupted or exceeded one hour.'));
      else if (code !== 0) reject(new Error(`Experimental GPU export failed (${code}): ${detail.trim()}`));
      else resolve();
    });
  });
}
