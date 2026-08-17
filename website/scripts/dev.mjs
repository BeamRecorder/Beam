import { spawn } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const commands = [
  ['website', 'dev:marketing'],
  ['docs', 'dev:docs'],
];
const children = new Set();
let stopping = false;

const stop = (signal = 'SIGTERM') => {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
};

for (const [name, script] of commands) {
  const child = spawn(npmCommand, ['run', script], {
    cwd: new URL('..', import.meta.url),
    stdio: 'inherit',
  });
  children.add(child);
  child.once('error', (error) => {
    console.error(`[website:dev] Unable to start ${name}:`, error);
    stop();
    process.exitCode = 1;
  });
  child.once('exit', (code, signal) => {
    children.delete(child);
    if (stopping) return;
    console.error(`[website:dev] ${name} stopped (${signal ?? `exit ${code ?? 1}`}).`);
    process.exitCode = code || 1;
    stop();
  });
}

process.once('SIGINT', () => stop('SIGINT'));
process.once('SIGTERM', () => stop('SIGTERM'));
