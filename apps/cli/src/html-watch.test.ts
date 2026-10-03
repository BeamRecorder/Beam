import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { watchHtml } from './html-watch';

const hooks = vi.hoisted(() => ({ watch: vi.fn(), client: vi.fn(), snapshot: vi.fn(), publish: vi.fn() }));
vi.mock('node:fs', async (original) => {
  const actual = await original<typeof import('node:fs')>();
  return { ...actual, default: { ...actual, watch: hooks.watch }, watch: hooks.watch };
});
vi.mock('./agent-client', () => ({ createAgentClient: hooks.client }));
vi.mock('./html-publish', () => ({ readLiveDocument: hooks.snapshot, publishHtml: hooks.publish }));
const input = () => ({
  projectId: 'project',
  expectedRevision: 0,
  entry: 'composition/index.html',
  width: 64,
  height: 64,
  durationMs: 1000,
});
let signal: () => void, change: (event: string, file: string | null) => void;
let watchers: (EventEmitter & { close: ReturnType<typeof vi.fn> })[];
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  watchers = [];
  hooks.watch.mockImplementation((_root, _options, listener) => {
    change = listener;
    const watcher = Object.assign(new EventEmitter(), { close: vi.fn() });
    watchers.push(watcher);
    return watcher;
  });
  hooks.client.mockReturnValue({});
  hooks.snapshot.mockResolvedValue({ revision: 4 });
  hooks.publish.mockResolvedValue({ layerId: 'layer', revision: 5 });
  vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  const original = process.once;
  vi.spyOn(process, 'once').mockImplementation(function (event, listener) {
    if (event === 'SIGINT' || event === 'SIGTERM') {
      signal = listener as () => void;
      return process;
    }
    return original.call(process, event, listener);
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const settle = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
describe('HTML source watcher', () => {
  it('publishes once, remembers the layer and cleans up on Ctrl+C', async () => {
    const running = watchHtml(
      {
        ...input(),
        references: [
          { name: 'a.png', source: '/references/a.png' },
          { name: 'b.png', source: 'project-media://screenshot/source' },
        ],
      },
      '/working',
      123,
    );
    await settle();
    expect(hooks.watch).toHaveBeenCalledTimes(2);
    expect(hooks.publish).toHaveBeenCalledTimes(1);
    expect(hooks.publish).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ expectedRevision: 4, layerId: 'layer' }),
      '/working',
    );
    signal();
    await running;
    expect(watchers.every((watcher) => watcher.close.mock.calls.length > 0)).toBe(true);
  });
  it('ignores build/dependency events and coalesces saves while a compile is in flight', async () => {
    const running = watchHtml(input(), '/working');
    await settle();
    change('change', 'node_modules/module.js');
    await vi.advanceTimersByTimeAsync(300);
    expect(hooks.publish).toHaveBeenCalledTimes(1);
    let complete!: () => void;
    hooks.publish.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = () => resolve({ layerId: 'layer', revision: 6 });
        }),
    );
    change('change', 'main.ts');
    change('change', 'index.html');
    await vi.advanceTimersByTimeAsync(250);
    change('change', null);
    await vi.advanceTimersByTimeAsync(250);
    expect(hooks.publish).toHaveBeenCalledTimes(2);
    complete();
    await settle();
    expect(hooks.publish).toHaveBeenCalledTimes(3);
    signal();
    await running;
  });
  it('reports compilation errors without stopping and terminates on a watcher error', async () => {
    hooks.publish.mockRejectedValueOnce(new Error('Shader compilation failed'));
    const running = watchHtml(input(), '/working');
    await settle();
    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('html.error'));
    change('change', 'main.ts');
    await vi.advanceTimersByTimeAsync(250);
    expect(process.stdout.write).toHaveBeenCalledWith(expect.stringContaining('html.published'));
    watchers[0]!.emit('error', new Error('Directory removed'));
    await running;
    expect(process.stderr.write).toHaveBeenCalledWith('Directory removed\n');
  });
  it('closes already-created watchers when a later reference directory cannot be watched', async () => {
    const original = hooks.watch.getMockImplementation()!;
    hooks.watch.mockImplementation((...args) => {
      if (watchers.length) throw new Error('Missing reference directory');
      return original(...args);
    });
    await expect(
      watchHtml({ ...input(), references: [{ name: 'a.png', source: '/missing/a.png' }] }, '/working'),
    ).rejects.toThrow('Missing reference');
    expect(watchers[0]!.close).toHaveBeenCalledTimes(1);
  });
});
