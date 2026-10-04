// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createDocumentSession } from './document-session';
import { createTransactionChannel } from './transaction-channel';
import { createDocumentEndpoint } from './document-endpoint';
import { createCompositionCommands } from '../commands/composition-commands';
import { emptyComposition } from '../shared/composition-types';
import { validateComposition } from '../commands/clip-composition-validation';
import { colorClip } from '../scene/tests/scene-fixtures';
import type { DocumentTransaction } from './transaction-types';

const setup = () => {
  const session = createDocumentSession(emptyComposition(), {
    commands: createCompositionCommands(),
    validate: validateComposition,
  });
  return {
    session,
    channel: createTransactionChannel('project', session),
    endpoint: createDocumentEndpoint('project', session),
  };
};
const transaction = (patch: Partial<DocumentTransaction> = {}): DocumentTransaction => ({
  version: 1,
  documentId: 'project',
  actorId: 'agent',
  operationId: 'operation',
  expectedRevision: 0,
  commands: [{ type: 'clip.add', payload: colorClip() }],
  ...patch,
});

describe('shared document transaction channel', () => {
  it('commits a complete batch once and publishes owned immutable command data', () => {
    const { session, channel } = setup(),
      input = transaction();
    const events: unknown[] = [];
    const unsubscribe = channel.subscribe((event) => events.push(event));
    const result = channel.apply(input);
    expect(result).toMatchObject({ actorId: 'agent', revision: 1, previousRevision: 0 });
    expect(session.document.clips).toHaveLength(1);
    expect(events).toEqual([result]);
    expect(Object.isFrozen(result.commands[0]?.payload)).toBe(true);
    unsubscribe();
    channel.apply(transaction({ operationId: 'second', expectedRevision: 1, commands: [] }));
    expect(events).toHaveLength(1);
  });
  it('deduplicates retries before checking their original revision and rejects ID reuse', () => {
    const { channel } = setup();
    const first = channel.apply(transaction());
    expect(channel.apply(transaction())).toBe(first);
    expect(() => channel.apply(transaction({ commands: [] }))).toThrow('reused');
  });
  it('rejects stale/foreign revisions and malformed envelopes without changing the document', () => {
    const { session, channel } = setup(),
      before = session.document;
    expect(() => channel.apply(transaction({ expectedRevision: 8 }))).toThrow('Revision conflict');
    expect(() => channel.apply(transaction({ documentId: 'other' }))).toThrow('Invalid');
    expect(() => channel.apply(transaction({ actorId: 1 as unknown as string }))).toThrow('Invalid');
    expect(session.document).toBe(before);
  });
  it('rolls back a failed command in a batch and does not remember the failed operation', () => {
    const { session, channel } = setup();
    expect(() =>
      channel.apply(transaction({ commands: [...transaction().commands, { type: 'unknown', payload: null }] })),
    ).toThrow();
    expect(session.revision).toBe(0);
    expect(channel.apply(transaction()).revision).toBe(1);
  });
  it('bounds retry history and leaves duplicate authored clips unchanged on eviction', () => {
    const { channel, session } = setup();
    for (let index = 0; index < 513; index++) channel.apply(transaction({ operationId: String(index), commands: [] }));
    expect(channel.apply(transaction()).revision).toBe(1);
    expect(session.document.clips[0]?.id).toBe('a');
  });
  it('shares snapshot, transaction and undo/redo methods across transports', async () => {
    const { endpoint } = setup();
    expect(await endpoint.receive({ version: 1, id: 'get', method: 'snapshot' })).toMatchObject({
      ok: true,
      result: { revision: 0 },
    });
    expect(
      await endpoint.receive({ version: 1, id: 'edit', method: 'transaction', transaction: transaction() }),
    ).toMatchObject({ ok: true, result: { revision: 1 } });
    expect(await endpoint.receive({ version: 1, id: 'undo', method: 'undo', expectedRevision: 1 })).toMatchObject({
      ok: true,
      result: { revision: 2, document: { clips: [] } },
    });
    expect(await endpoint.receive({ version: 1, id: 'redo', method: 'redo', expectedRevision: 2 })).toMatchObject({
      ok: true,
      result: { revision: 3 },
    });
  });
  it('returns structured errors for invalid JSON envelopes and revision conflicts', async () => {
    const { endpoint } = setup();
    expect(await endpoint.receive(null)).toMatchObject({ id: null, ok: false, error: { code: 'invalid-request' } });
    expect(await endpoint.receive({ version: 1, id: 'x', method: 'unknown' })).toMatchObject({ id: 'x', ok: false });
    expect(await endpoint.receive({ version: 1, id: 'x', method: 'undo', expectedRevision: 7 })).toMatchObject({
      error: { code: 'revision-conflict' },
    });
  });
});

it('reports observer failures separately and keeps committed retries idempotent', async () => {
  const { session, channel, endpoint } = setup();
  session.subscribe(() => {
    throw new Error('view failed');
  });
  channel.subscribe(() => {
    throw new Error('transport failed');
  });
  const first = channel.apply(transaction());
  expect(channel.apply(transaction())).toBe(first);
  expect(session.revision).toBe(1);
  expect(session.takeObserverErrors().map(String)).toEqual(['Error: view failed']);
  expect(channel.takeObserverErrors().map(String)).toEqual(['Error: transport failed']);
  const unsubscribe = endpoint.subscribe(() => {
    throw new Error('history observer');
  });
  expect(await endpoint.receive({ version: 1, id: 'undo', method: 'undo', expectedRevision: 1 })).toMatchObject({
    ok: true,
  });
  expect(endpoint.takeObserverErrors().map(String)).toEqual(['Error: view failed', 'Error: history observer']);
  expect(endpoint.takeObserverErrors()).toEqual([]);
  unsubscribe();
});
it('broadcasts history once, deduplicates history retries and serializes simultaneous requests', async () => {
  const { endpoint } = setup(),
    events: unknown[] = [];
  endpoint.subscribe((event) => events.push(event));
  await endpoint.receive({ version: 1, id: 'edit', method: 'transaction', transaction: transaction() });
  const undo = { version: 1, id: 'undo', method: 'undo', expectedRevision: 1 };
  const [first, second] = await Promise.all([endpoint.receive(undo), endpoint.receive(undo)]);
  expect(second).toBe(first);
  expect(events).toHaveLength(2);
  expect(events[1]).toMatchObject({ method: 'undo', revision: 2, document: { clips: [] } });
  expect(await endpoint.receive({ ...undo, method: 'redo', expectedRevision: 2 })).toMatchObject({ ok: false });
});
it('bounds observer errors while running other subscribers', () => {
  const { channel } = setup();
  let observed = 0;
  channel.subscribe(() => {
    throw new Error('failed');
  });
  channel.subscribe(() => observed++);
  for (let index = 0; index < 65; index++) channel.apply(transaction({ operationId: String(index), commands: [] }));
  expect(observed).toBe(65);
  expect(channel.takeObserverErrors()).toHaveLength(64);
});
it('rejects every invalid protocol envelope and malformed command before publishing', async () => {
  const { channel, endpoint } = setup();
  for (const patch of [
    { version: 2 },
    { operationId: '' },
    { actorId: '' },
    { expectedRevision: -1 },
    { expectedRevision: 1.2 },
    { commands: new Array(1001).fill({ type: 'none', payload: null }) },
    { commands: [{}] },
    { commands: [{ type: 'x' }] },
  ])
    expect(() => channel.apply({ ...transaction(), ...patch } as DocumentTransaction)).toThrow();
  expect(() => createTransactionChannel('', setup().session)).toThrow('id');
  for (const value of [
    { version: 2, id: 'x' },
    { version: 1, id: 2 },
    { version: 1, id: '' },
  ])
    expect(await endpoint.receive(value)).toMatchObject({ ok: false, id: null });
  const events: unknown[] = [];
  endpoint.subscribe((event) => events.push(event));
  for (let i = 0; i < 513; i++)
    expect(await endpoint.receive({ version: 1, id: String(i), method: 'undo', expectedRevision: 0 })).toMatchObject({
      ok: true,
    });
  expect(events).toEqual([]);
});
