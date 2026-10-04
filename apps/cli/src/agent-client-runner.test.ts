import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAgentClient, listAgentInstances } from './agent-client';
import { runAgentCommand } from './agent-runner';

const hooks = vi.hoisted(() => ({ discover: vi.fn(), call: vi.fn(), watch: vi.fn() }));
vi.mock('@beam/native-client/agent-discovery', () => ({ discoverAgents: hooks.discover }));
vi.mock('./agent-tools', () => ({ callAgentTool: hooks.call }));
vi.mock('./html-watch', () => ({ watchHtml: hooks.watch }));
const instance = { version: 1, pid: 123, port: 4567, token: 'test-token', profile: 'profile' };
beforeEach(() => {
  vi.clearAllMocks();
  hooks.discover.mockReturnValue([instance]);
});
afterEach(() => vi.restoreAllMocks());
describe('agent CLI transport and argument boundaries', () => {
  it('excludes credentials from discovery and sends authenticated versioned requests', async () => {
    expect(listAgentInstances()).toEqual([{ version: 1, pid: 123, port: 4567, profile: 'profile' }]);
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ok: true, result: { value: 1 } })));
    expect(await createAgentClient().call('projects.list', {})).toEqual({ value: 1 });
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:4567/rpc',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
        body: JSON.stringify({ version: 1, tool: 'projects.list', arguments: {} }),
      }),
    );
  });
  it('propagates structured and transport errors with an actionable default HTTP message', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const client = createAgentClient(123);
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: 'Closed editor' }), { status: 400 }));
    await expect(client.call('documents.snapshot', {})).rejects.toThrow('Closed editor');
    fetch.mockResolvedValueOnce(new Response('{}', { status: 500 }));
    await expect(client.call('x', {})).rejects.toThrow('500');
    fetch.mockRejectedValueOnce(new Error('Connection refused'));
    await expect(client.call('x', {})).rejects.toThrow('Connection refused');
  });
  it('routes inline JSON, missing empty arguments, documentation and instance selection', async () => {
    await runAgentCommand(['tools', 'call', 'documents.snapshot', '{"projectId":"project"}', '--instance', '123']);
    expect(hooks.call).toHaveBeenCalledWith('documents.snapshot', { projectId: 'project' }, process.cwd(), 123);
    await runAgentCommand(['tools', 'call', 'projects.list']);
    expect(hooks.call).toHaveBeenLastCalledWith('projects.list', {}, process.cwd(), undefined);
    expect(await runAgentCommand(['instances'])).toHaveProperty('instances');
    expect(await runAgentCommand(['docs', 'agent'])).toHaveProperty('content');
  });
  it('reads argument files relative to their own folder and routes the watcher', async () => {
    const root = await mkdtemp(join(tmpdir(), 'beam-runner-'));
    const file = join(root, 'arguments.json');
    try {
      await writeFile(file, '{"entry":"index.html"}');
      await runAgentCommand(['tools', 'call', 'html.publish', `@${file}`]);
      expect(hooks.call).toHaveBeenCalledWith('html.publish', { entry: 'index.html' }, root, undefined);
      await runAgentCommand(['html', 'watch', `@${file}`]);
      expect(hooks.watch).toHaveBeenCalledWith({ entry: 'index.html' }, root, undefined);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('reads JSON on stdin and bounds its input', async () => {
    const iterator = vi.spyOn(process.stdin, Symbol.asyncIterator);
    iterator.mockImplementation(async function* (): AsyncGenerator<Buffer, undefined> {
      yield Buffer.from('{}');
      return undefined;
    });
    await runAgentCommand(['tools', 'call', 'projects.list', '-']);
    expect(hooks.call).toHaveBeenCalledWith('projects.list', {}, process.cwd(), undefined);
    iterator.mockImplementation(async function* (): AsyncGenerator<Buffer, undefined> {
      yield Buffer.alloc(8 * 1024 * 1024 + 1);
      return undefined;
    });
    await expect(runAgentCommand(['tools', 'call', 'projects.list', '-'])).rejects.toThrow('8 MiB');
  });
  it('rejects duplicate/trailing instance options, excessive arguments and malformed JSON', async () => {
    for (const args of [
      ['tools', 'call', 'x', '--instance'],
      ['tools', 'call', 'x', '--instance', '123', 'extra'],
      ['tools', 'call', 'x', '{}', 'extra'],
      ['html', 'watch', '{}', 'extra'],
    ])
      await expect(runAgentCommand(args)).rejects.toThrow();
    await expect(runAgentCommand(['tools', 'call', 'x', '{'])).rejects.toThrow();
  });
});
