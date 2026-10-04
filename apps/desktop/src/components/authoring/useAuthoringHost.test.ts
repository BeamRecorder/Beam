import { describe, it, expect, vi, beforeEach } from 'vitest';
import { effectScope, ref, nextTick } from 'vue';
import { createCommandRegistry } from '@beam/engine/commands/command-registry';
import { useAuthoringHost } from './useAuthoringHost';
import type { AuthoringMessage } from '~/api/types/authoring-api';
import { createLiveVideoCommands } from './video-authoring-commands';
import { createRenderDocument } from '@beam/engine';
import { withHtmlFrameSources } from './html-export';

const bridge = vi.hoisted(() => ({
  registerAuthoringDocument: vi.fn(async () => {}),
  replyAuthoringRequest: vi.fn(),
  onAuthoringRequest: vi.fn(),
  getHtmlFrameSources: vi.fn(),
}));
vi.mock('~/api/capture', () => ({ capture: bridge }));
beforeEach(() => {
  vi.clearAllMocks();
  bridge.registerAuthoringDocument.mockResolvedValue(undefined);
});
function setup() {
  const current = ref({ value: 1 }),
    context = ref<string | null>('project');
  let handler!: (message: AuthoringMessage) => Promise<void>;
  const stop = vi.fn(),
    save = vi.fn(async () => {});
  bridge.onAuthoringRequest.mockImplementation((listener) => {
    handler = listener;
    return stop;
  });
  const commands = createCommandRegistry<{ value: number }>();
  commands.register({ type: 'set', parse: (input) => Number(input), apply: (_document, value) => ({ value }) });
  const scope = effectScope();
  scope.run(() =>
    useAuthoringHost({
      context: () => (context.value ? { projectId: context.value, name: 'Test', kind: 'video' } : null),
      read: () => current.value,
      apply: (next) => {
        current.value = next;
      },
      commands,
      validate: () => {},
      undo: async () => {},
      redo: async () => {},
      canEdit: () => true,
      canUndo: () => false,
      canRedo: () => false,
      save,
    }),
  );
  const transaction = (): AuthoringMessage => ({
    id: 'ipc',
    request: {
      version: 1,
      id: 'request',
      method: 'transaction',
      transaction: {
        version: 1,
        documentId: 'project',
        actorId: 'agent',
        operationId: 'operation',
        expectedRevision: 0,
        commands: [{ type: 'set', payload: 2 }],
      },
    },
  });
  return { scope, current, context, stop, save, handler, transaction };
}
describe('Vue authoring host bridge', () => {
  it('registers the current editor and persists a real transaction before replying', async () => {
    const fixture = setup();
    expect(bridge.registerAuthoringDocument).toHaveBeenCalledWith({
      projectId: 'project',
      kind: 'video',
      name: 'Test',
    });
    await fixture.handler(fixture.transaction());
    expect(fixture.current.value).toEqual({ value: 2 });
    expect(fixture.save).toHaveBeenCalledTimes(1);
    expect(bridge.replyAuthoringRequest).toHaveBeenCalledWith('ipc', expect.objectContaining({ ok: true }));
    fixture.scope.stop();
    expect(fixture.stop).toHaveBeenCalledTimes(1);
    expect(bridge.registerAuthoringDocument).toHaveBeenLastCalledWith(null);
  });
  it('keeps manual edits in revision checks and does not persist read-only snapshots', async () => {
    const fixture = setup();
    fixture.current.value.value = 7;
    await nextTick();
    await fixture.handler({ id: 'snapshot', request: { version: 1, id: 'snapshot', method: 'snapshot' } });
    expect(bridge.replyAuthoringRequest).toHaveBeenLastCalledWith(
      'snapshot',
      expect.objectContaining({ result: { documentId: 'project', revision: 1, document: { value: 7 } } }),
    );
    await fixture.handler(fixture.transaction());
    expect(bridge.replyAuthoringRequest).toHaveBeenLastCalledWith('ipc', expect.objectContaining({ ok: false }));
    expect(fixture.save).not.toHaveBeenCalled();
    fixture.scope.stop();
  });
  it('reports persistence failure explicitly and unregisters a closing document', async () => {
    const fixture = setup();
    fixture.save.mockRejectedValue(new Error('disk full'));
    await fixture.handler(fixture.transaction());
    expect(fixture.current.value.value).toBe(2);
    expect(bridge.replyAuthoringRequest).toHaveBeenCalledWith(
      'ipc',
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ message: expect.stringContaining('Edit applied but persistence failed') }),
      }),
    );
    fixture.context.value = null;
    await nextTick();
    expect(bridge.registerAuthoringDocument).toHaveBeenLastCalledWith(null);
    bridge.replyAuthoringRequest.mockClear();
    await fixture.handler(fixture.transaction());
    expect(bridge.replyAuthoringRequest).not.toHaveBeenCalled();
    fixture.scope.stop();
  });
  it('does not reply after disposal while persistence is pending', async () => {
    const fixture = setup();
    let complete!: () => void;
    fixture.save.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    const pending = fixture.handler(fixture.transaction());
    for (let i = 0; i < 8; i++) await Promise.resolve();
    fixture.scope.stop();
    complete();
    await pending;
    expect(bridge.replyAuthoringRequest).not.toHaveBeenCalled();
  });
  it('does not persist a different project when navigation races with a request', async () => {
    const fixture = setup();
    const pending = fixture.handler(fixture.transaction());
    fixture.context.value = 'another-project';
    await nextTick();
    await pending;
    expect(fixture.save).not.toHaveBeenCalled();
    expect(bridge.replyAuthoringRequest).not.toHaveBeenCalled();
    fixture.scope.stop();
  });
  it('does not reply with a stale persistence error after the editor closes', async () => {
    const fixture = setup();
    let fail!: (error: Error) => void;
    fixture.save.mockImplementation(
      () =>
        new Promise<void>((_resolve, reject) => {
          fail = reject;
        }),
    );
    const pending = fixture.handler(fixture.transaction());
    for (let i = 0; i < 8; i++) await Promise.resolve();
    fixture.scope.stop();
    fail(new Error('closed'));
    await pending;
    expect(bridge.replyAuthoringRequest).not.toHaveBeenCalled();
  });
});
describe('live export/document settings ownership', () => {
  it('accepts settings owned by UI history and rejects host metadata instead of silently ignoring it', () => {
    const document = createRenderDocument(),
      commands = createLiveVideoCommands();
    expect(commands.types).toContain('render.patch');
    expect(commands.execute(document, { type: 'render.patch', payload: { blurPercent: 12 } }).blurPercent).toBe(12);
    expect(() => commands.execute(document, { type: 'render.patch', payload: { render: { fps: 60 } } })).toThrow(
      'Live render.patch',
    );
    expect(() => commands.execute(document, { type: 'render.patch', payload: null })).toThrow();
  });
  it('keeps normal exports unchanged, resolves HTML sources and propagates source errors', async () => {
    const request = {
      projectName: 'Test',
      format: 'webm' as const,
      preset: 'high' as const,
      snapshot: createRenderDocument(),
    };
    expect(await withHtmlFrameSources(request)).toBe(request);
    expect(bridge.getHtmlFrameSources).not.toHaveBeenCalled();
    const html = {
      version: 1 as const,
      id: 'id',
      revision: 'rev',
      entry: 'index.html',
      width: 64,
      height: 64,
      durationMs: 0,
      fps: 30,
      framework: 'html' as const,
    };
    request.snapshot.composition.assets.push({
      id: 'html',
      kind: 'image',
      origin: 'project',
      src: 'preview.png',
      fileName: 'preview.png',
      width: 64,
      height: 64,
      durationMs: 0,
      name: 'HTML',
      html,
    });
    bridge.getHtmlFrameSources.mockResolvedValue([{ assetId: 'html', url: 'http://localhost/frame' }]);
    expect(await withHtmlFrameSources(request)).toHaveProperty('frameSources');
    bridge.getHtmlFrameSources.mockRejectedValue(new Error('missing source'));
    await expect(withHtmlFrameSources(request)).rejects.toThrow('missing source');
  });
});
