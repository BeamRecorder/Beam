// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createCommandRegistry } from '../commands/command-registry';
import { createDocumentSession } from './document-session';

function session() {
  const commands = createCommandRegistry<{ count: number }>();
  commands.register({
    type: 'add',
    parse(payload) {
      if (typeof payload !== 'number') throw new Error('number required');
      return payload;
    },
    apply: (document, payload) => ({ count: document.count + payload }),
  });
  const initial = { count: 0 };
  return {
    initial,
    commands,
    engine: createDocumentSession(initial, {
      commands,
      validate(document) {
        if (document.count < 0) throw new Error('negative count');
      },
    }),
  };
}

describe('extensible document sessions', () => {
  it('retains immutable snapshots by identity through undo and redo', async () => {
    const { engine } = session();
    const before = engine.document;
    engine.execute({ type: 'add', payload: 1 });
    const after = engine.document;
    expect(Object.isFrozen(after)).toBe(true);
    await engine.undo();
    expect(engine.document).toBe(before);
    await engine.redo();
    expect(engine.document).toBe(after);
  });
  it('rejects mutation by a misbehaving command before publication', () => {
    const { engine, commands } = session();
    commands.register({
      type: 'mutate',
      parse: () => null,
      apply(document) {
        document.count++;
        return document;
      },
    });
    expect(() => engine.execute({ type: 'mutate', payload: null })).toThrow();
    expect(engine.document.count).toBe(0);
    expect(engine.canUndo).toBe(false);
  });
  it('owns the initial document and starts without undo/redo', () => {
    const { engine, initial } = session();
    initial.count = 99;
    expect(engine.document).toEqual({ count: 0 });
    expect(engine.revision).toBe(0);
    expect(engine.canUndo).toBe(false);
    expect(engine.canRedo).toBe(false);
  });
  it('commits a batch in one revision and one undo step', async () => {
    const { engine } = session();
    engine.transaction([
      { type: 'add', payload: 2 },
      { type: 'add', payload: 3 },
    ]);
    expect(engine.document.count).toBe(5);
    expect(engine.revision).toBe(1);
    expect(engine.canUndo).toBe(true);
    await engine.undo();
    expect(engine.document.count).toBe(0);
    expect(engine.canRedo).toBe(true);
    await engine.redo();
    expect(engine.document.count).toBe(5);
  });
  it('leaves state and history unchanged when a later command fails', () => {
    const { engine } = session();
    expect(() =>
      engine.transaction([
        { type: 'add', payload: 1 },
        { type: 'missing', payload: 1 },
      ]),
    ).toThrow('Unknown');
    expect(engine.document.count).toBe(0);
    expect(engine.revision).toBe(0);
    expect(engine.canUndo).toBe(false);
  });
  it('rejects invalid final documents before publication', () => {
    const { engine } = session();
    expect(() => engine.execute({ type: 'add', payload: -1 })).toThrow('negative');
    expect(engine.document.count).toBe(0);
    expect(engine.canUndo).toBe(false);
  });
  it('ignores empty batches and detaches subscribers', () => {
    const { engine } = session();
    const listener = vi.fn();
    const stop = engine.subscribe(listener);
    engine.transaction([]);
    expect(listener).not.toHaveBeenCalled();
    engine.execute({ type: 'add', payload: 1 });
    expect(listener).toHaveBeenCalledOnce();
    stop();
    engine.execute({ type: 'add', payload: 1 });
    expect(listener).toHaveBeenCalledOnce();
  });
  it('accepts new commands without changing the engine', () => {
    const { engine, commands } = session();
    commands.register({ type: 'double', parse: () => undefined, apply: (document) => ({ count: document.count * 2 }) });
    engine.execute({ type: 'add', payload: 2 });
    engine.execute({ type: 'double', payload: null });
    expect(engine.document.count).toBe(4);
    expect(commands.types).toEqual(['add', 'double']);
  });
  it('rejects duplicate, empty and invalid commands', () => {
    const { commands, engine } = session();
    const handler = { parse: () => 0, apply: (document: { count: number }) => document };
    expect(() => commands.register({ ...handler, type: 'add' })).toThrow('Duplicate');
    expect(() => commands.register({ ...handler, type: ' ' })).toThrow('empty');
    expect(() => engine.execute({ type: 'add', payload: 'bad' })).toThrow('number required');
  });
});
