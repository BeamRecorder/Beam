// @vitest-environment node
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocked = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: mocked.spawn }));
import { runExportProcess } from './export-process';
let child: EventEmitter & { stderr: EventEmitter; kill: ReturnType<typeof vi.fn> };
beforeEach(() => {
  child = Object.assign(new EventEmitter(), { stderr: new EventEmitter(), kill: vi.fn() });
  mocked.spawn.mockReset().mockReturnValue(child);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it('uses argv and preserves environment/paths verbatim, then releases signal handlers', async () => {
  const before = process.listenerCount('SIGINT');
  const task = runExportProcess('/beam path', ['host path', 'config path'], { DISPLAY: ':0' });
  expect(mocked.spawn).toHaveBeenCalledWith('/beam path', ['host path', 'config path'], {
    env: { DISPLAY: ':0' },
    detached: process.platform === 'linux',
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  child.emit('close', 0);
  await task;
  expect(process.listenerCount('SIGINT')).toBe(before);
  expect(vi.getTimerCount()).toBe(0);
});
it('reports bounded stderr on a failed process, including signal exits', async () => {
  const task = runExportProcess('beam', [], {});
  const failure = expect(task).rejects.toThrow('native failure');
  child.stderr.emit('data', Buffer.from('x'.repeat(20000) + 'native failure'));
  child.emit('close', null);
  await failure;
  expect(vi.getTimerCount()).toBe(0);
});
it('reports spawn failures and removes all owned deadlines/listeners', async () => {
  const before = process.listenerCount('SIGTERM');
  const task = runExportProcess('missing', [], {});
  const failure = expect(task).rejects.toThrow('ENOENT');
  child.emit('error', new Error('ENOENT'));
  child.emit('close', -1);
  await failure;
  expect(process.listenerCount('SIGTERM')).toBe(before);
  expect(vi.getTimerCount()).toBe(0);
});
it('cancels once, forces a stalled host to stop, and rejects even if it exits successfully', async () => {
  const task = runExportProcess('beam', [], {});
  const failure = expect(task).rejects.toThrow('interrupted');
  process.emit('SIGINT');
  process.emit('SIGTERM');
  expect(child.kill).toHaveBeenCalledExactlyOnceWith('SIGTERM');
  await vi.advanceTimersByTimeAsync(5000);
  expect(child.kill).toHaveBeenLastCalledWith('SIGKILL');
  child.emit('close', 0);
  await failure;
  expect(vi.getTimerCount()).toBe(0);
});
it('terminates a job that exceeds the export deadline', async () => {
  const task = runExportProcess('beam', [], {});
  const failure = expect(task).rejects.toThrow('one hour');
  await vi.advanceTimersByTimeAsync(3600000);
  expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  child.emit('close', 1);
  await failure;
});
it.skipIf(process.platform !== 'linux')(
  'terminates every process in the owned Linux host group on cancellation',
  async () => {
    Object.assign(child, { pid: 987654 });
    const kill = vi.spyOn(process, 'kill').mockReturnValue(true);
    const task = runExportProcess('beam', [], {});
    const failure = expect(task).rejects.toThrow('interrupted');
    process.emit('SIGTERM');
    expect(kill).toHaveBeenCalledWith(-987654, 'SIGTERM');
    child.emit('close', 1);
    await failure;
    expect(kill).toHaveBeenCalledWith(-987654, 'SIGKILL');
  },
);
it.skipIf(process.platform !== 'linux')('tolerates exited process groups and reports termination errors', async () => {
  Object.assign(child, { pid: 987654 });
  const kill = vi.spyOn(process, 'kill').mockImplementation(() => {
    throw Object.assign(new Error('gone'), { code: 'ESRCH' });
  });
  const task = runExportProcess('beam', [], {});
  const failure = expect(task).rejects.toThrow('interrupted');
  process.emit('SIGINT');
  child.emit('close', 1);
  await failure;
  kill.mockImplementation(() => {
    throw Object.assign(new Error('termination denied'), { code: 'EPERM' });
  });
  const denied = runExportProcess('beam', [], {});
  const deniedFailure = expect(denied).rejects.toThrow('termination denied');
  child.emit('close', 1);
  await deniedFailure;
});
