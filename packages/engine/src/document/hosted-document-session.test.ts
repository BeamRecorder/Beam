import { describe, it, expect, vi } from 'vitest';
import { createHostedDocumentSession } from './hosted-document-session';
import { createCommandRegistry } from '../commands/command-registry';
import { createDocumentEndpoint } from './document-endpoint';

function setup() {
  let current = { value: 1 },
    busy = false;
  const history = [current];
  let index = 0;
  const commands = createCommandRegistry<typeof current>();
  commands.register({
    type: 'set',
    parse: (value: unknown) => Number(value),
    apply: (_document, value) => ({ value }),
  });
  const apply = vi.fn((document: typeof current) => {
    current = document;
    history.splice(++index);
    history.push(document);
  });
  const session = createHostedDocumentSession({
    commands,
    read: () => current,
    apply,
    validate: (document) => {
      if (!Number.isFinite(document.value) || document.value < 0) throw new Error('Invalid value.');
    },
    undo: async () => {
      if (index) current = history[--index]!;
    },
    redo: async () => {
      if (index + 1 < history.length) current = history[++index]!;
    },
    canUndo: () => index > 0,
    canRedo: () => index + 1 < history.length,
    canEdit: () => !busy,
  });
  return {
    session,
    apply,
    update: (value: number) => {
      current.value = value;
    },
    busy: () => {
      busy = true;
    },
  };
}
describe('active host document session', () => {
  it('commits a transaction to the host once and retains its undo stack', async () => {
    const { session, apply } = setup();
    session.transaction([
      { type: 'set', payload: 2 },
      { type: 'set', payload: 3 },
    ]);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(session.revision).toBe(1);
    expect(session.canUndo).toBe(true);
    await session.undo();
    expect(session.document.value).toBe(1);
    expect(session.revision).toBe(2);
    expect(session.canRedo).toBe(true);
    await session.redo();
    expect(session.document.value).toBe(3);
    expect(session.revision).toBe(3);
  });
  it('observes manual changes and returns owned snapshots', () => {
    const { session, update } = setup();
    const copy = session.document;
    copy.value = 99;
    expect(session.document.value).toBe(1);
    update(5);
    expect(session.revision).toBe(1);
    expect(session.document.value).toBe(5);
    expect(session.revision).toBe(1);
  });
  it('leaves state and history intact after validation or command failure', () => {
    const { session, apply } = setup();
    expect(() =>
      session.transaction([
        { type: 'set', payload: 8 },
        { type: 'set', payload: -1 },
      ]),
    ).toThrow('Invalid');
    expect(() => session.execute({ type: 'unknown', payload: 2 })).toThrow();
    expect(session.document).toEqual({ value: 1 });
    expect(session.revision).toBe(0);
    expect(apply).not.toHaveBeenCalled();
  });
  it('rejects busy mutations and leaves no-op transactions unchanged', async () => {
    const { session, busy, apply } = setup();
    session.transaction([]);
    expect(apply).not.toHaveBeenCalled();
    busy();
    expect(() => session.execute({ type: 'set', payload: 3 })).toThrow('busy');
    await expect(session.undo()).rejects.toThrow('busy');
    await expect(session.redo()).rejects.toThrow('busy');
  });
  it('isolates observer failures and rejects edits reentered by an observer', () => {
    const { session } = setup();
    const observer = vi.fn(() => session.execute({ type: 'set', payload: 8 }));
    const stop = session.subscribe(observer);
    session.execute({ type: 'set', payload: 3 });
    expect(session.document.value).toBe(3);
    expect(session.takeObserverErrors()).toHaveLength(1);
    expect(session.takeObserverErrors()).toEqual([]);
    stop();
    session.execute({ type: 'set', payload: 4 });
    expect(observer).toHaveBeenCalledTimes(1);
  });
  it('rejects a transaction whose revision predates a manual edit and deduplicates retries', async () => {
    const { session, update, apply } = setup();
    const endpoint = createDocumentEndpoint('project', session);
    const request = {
      version: 1,
      id: 'request',
      method: 'transaction',
      transaction: {
        version: 1,
        documentId: 'project',
        actorId: 'test',
        operationId: 'operation',
        expectedRevision: 0,
        commands: [{ type: 'set', payload: 9 }],
      },
    };
    update(2);
    expect(await endpoint.receive(request)).toMatchObject({ ok: false, error: { code: 'revision-conflict' } });
    request.transaction.expectedRevision = 1;
    expect(await endpoint.receive(request)).toMatchObject({ ok: true, result: { revision: 2 } });
    expect(await endpoint.receive(request)).toMatchObject({ ok: true, result: { revision: 2 } });
    expect(apply).toHaveBeenCalledTimes(1);
  });
});
