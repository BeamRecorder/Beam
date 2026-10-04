import { describe, it, expect, vi } from 'vitest';
import { TOOL_CATALOG, describeTool, validateToolArguments } from './tool-catalog';
import { selectAgent } from './agent-client';
import { callAgentTool } from './agent-tools';
import { readAgentDocs } from './agent-docs';
import { runAgentCommand } from './agent-runner';
import type { AgentClient } from './agent-types';
import { createAuthoringSession, createStillDocument } from '@beam/engine';

describe('discoverable agent tools', () => {
  it('exposes executable gradient authoring documentation through the tool schema', async () => {
    validateToolArguments('docs.read', { topic: 'gradients' });
    const docs = await readAgentDocs('gradients');
    const command = JSON.parse(/```json\n([\s\S]*?)```/.exec(docs.content)![1]!);
    const session = createAuthoringSession(createStillDocument('test', 'source.png', 100, 100));
    session.execute(command);
    expect(
      session.document.state.composition!.find((layer) => layer.id === '__background__')!.effects![0],
    ).toMatchObject({
      kind: 'gradient',
      recipe: { mode: 'flow' },
    });
  });
  it('advertises schemas offline and documents HTML without requiring a desktop instance', async () => {
    expect(await runAgentCommand(['tools', 'list'])).toMatchObject({ tools: TOOL_CATALOG });
    expect(await runAgentCommand(['tools', 'describe', 'html.publish'])).toEqual(describeTool('html.publish'));
    expect((await readAgentDocs('html')).content).toContain('seek(timeMs)');
    expect((await readAgentDocs('gradients')).content).toContain('still.layer.compositing');
    expect((await readAgentDocs()).github).toContain('BeamRecorder/Beam');
    await expect(readAgentDocs('missing')).rejects.toThrow('Unknown');
  });
  it('rejects missing fields, unknown tools/fields, bounds and malformed nested commands', () => {
    expect(() => describeTool('missing')).toThrow('Unknown');
    for (const input of [null, {}, { projectId: 'x', extra: true }])
      expect(() => validateToolArguments('documents.snapshot', input)).toThrow();
    expect(() =>
      validateToolArguments('html.publish', {
        projectId: 'x',
        expectedRevision: 0,
        entry: 'index.html',
        width: 2,
        height: 2,
        durationMs: 0,
        fps: 0,
      }),
    ).toThrow();
    expect(() =>
      validateToolArguments('documents.transact', {
        projectId: 'x',
        operationId: 'op',
        expectedRevision: 1,
        commands: [{ type: 'clip.move' }],
      }),
    ).toThrow('payload');
    expect(() => validateToolArguments('projects.create', { kind: 'unknown' })).toThrow('allowed');
    expect(() =>
      validateToolArguments('documents.transact', {
        projectId: 'x',
        operationId: 'op',
        expectedRevision: 1,
        commands: [],
      }),
    ).toThrow('bounds');
  });
  it('selects one instance and requires an explicit selection for multiple instances', () => {
    const first = { version: 1 as const, pid: 1, port: 1234, token: 'x' },
      second = { ...first, pid: 2 };
    expect(selectAgent([first])).toBe(first);
    expect(selectAgent([first, second], 2)).toBe(second);
    expect(() => selectAgent([])).toThrow('Start Beam');
    expect(() => selectAgent([first, second])).toThrow('Multiple');
    expect(() => selectAgent([first], 2)).toThrow('unavailable');
  });
  it('discovers font tools and forwards font imports relative to the argument directory', async () => {
    expect(describeTool('fonts.list').live).toBe(true);
    expect(describeTool('fonts.import').description).toContain('fontAssetId');
    const call = vi.fn().mockResolvedValue({ family: 'Hanken Grotesk', id: 'a'.repeat(64) });
    const client = { call } as AgentClient;
    await callAgentTool('fonts.list', {}, '/tmp/design', undefined, client);
    await callAgentTool('fonts.import', { source: 'fonts/Hanken.ttf' }, '/tmp/design', undefined, client);
    expect(call.mock.calls).toEqual([
      ['fonts.list', {}],
      ['fonts.import', { source: '/tmp/design/fonts/Hanken.ttf' }],
    ]);
  });
  it.each([{}, { source: '' }, { source: 1 }, { source: 'font.ttf', projectId: 'x' }])(
    'rejects invalid font import arguments before reaching the desktop: %j',
    async (input) => {
      const call = vi.fn();
      await expect(callAgentTool('fonts.import', input, '.', undefined, { call } as AgentClient)).rejects.toThrow();
      expect(call).not.toHaveBeenCalled();
    },
  );
  it('preserves the native font validation error', async () => {
    const call = vi.fn().mockRejectedValue(new Error('Fichier de police invalide'));
    await expect(
      callAgentTool('fonts.import', { source: 'broken.ttf' }, '.', undefined, { call } as AgentClient),
    ).rejects.toThrow('Fichier de police invalide');
  });
  it('builds a versioned transaction with caller-owned retry identity and propagates revision errors', async () => {
    const call = vi.fn().mockResolvedValue({ ok: true, result: { revision: 2 } });
    const client = { call } as AgentClient;
    const args = {
      projectId: 'project',
      expectedRevision: 1,
      operationId: 'operation',
      commands: [{ type: 'clip.delete', payload: { clipId: 'clip' } }],
    };
    expect(await callAgentTool('documents.transact', args, '.', undefined, client)).toEqual({ revision: 2 });
    expect(call.mock.calls[0]?.[1]).toMatchObject({
      request: {
        version: 1,
        method: 'transaction',
        transaction: {
          version: 1,
          actorId: 'beam-cli',
          documentId: 'project',
          expectedRevision: 1,
          operationId: 'operation',
          commands: args.commands,
        },
      },
    });
  });
  it('routes history and snapshots, and preserves structured failures', async () => {
    const call = vi.fn().mockResolvedValue({ ok: true, result: { revision: 1, document: {} } });
    const client = { call } as AgentClient;
    expect(await callAgentTool('documents.snapshot', { projectId: 'project' }, '.', undefined, client)).toHaveProperty(
      'revision',
      1,
    );
    await callAgentTool(
      'documents.undo',
      { projectId: 'project', expectedRevision: 1, requestId: 'undo' },
      '.',
      undefined,
      client,
    );
    expect(call.mock.calls[1]?.[1]).toMatchObject({ request: { method: 'undo', id: 'undo', expectedRevision: 1 } });
    call.mockResolvedValue({ ok: false, error: { code: 'revision-conflict', message: 'Changed.' } });
    await expect(
      callAgentTool(
        'documents.redo',
        { projectId: 'project', expectedRevision: 1, requestId: 'redo' },
        '.',
        undefined,
        client,
      ),
    ).rejects.toThrow('revision-conflict');
    await expect(callAgentTool('documents.snapshot', { projectId: 'project' }, '.', undefined, client)).rejects.toThrow(
      'Changed',
    );
  });
  it('keeps discovery/docs tools local and rejects invalid CLI flags', async () => {
    const client = { call: vi.fn() } as unknown as AgentClient;
    await callAgentTool('tools.list', {}, '.', undefined, client);
    await callAgentTool('docs.read', { topic: 'agent' }, '.', undefined, client);
    expect(client.call).not.toHaveBeenCalled();
    await expect(runAgentCommand(['tools', 'call', 'projects.list', '--instance', 'abc'])).rejects.toThrow('PID');
    await expect(runAgentCommand(['tools', 'wrong'])).rejects.toThrow('Use beam');
  });
});
