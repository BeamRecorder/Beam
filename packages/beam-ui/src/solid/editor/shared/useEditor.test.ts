import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRoot } from 'solid-js';
import type { ApplicationServices } from '@argui/host';
import type { BeamApi } from '../../shared/beamApi';
import type { BeamEvent } from '../../shared/beamTypes';
import { EditorApi } from './editorApi';
import { useEditor } from './useEditor';
import type { Snapshot, Transport } from './editorTypes';

const disposers: (() => void)[] = [];
const flush = async () => {
  for (let index = 0; index < 12; index++) await Promise.resolve();
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function mount() {
  let document: Snapshot = {
    activeSequence: 'sequence', sequences: [{ id: 'sequence', name: 'Timeline 1' }],
    project: {
      id: 'p',
      name: 'Test',
      canvas: { width: 320, height: 180, fps: 30, background: 0 },
      warnings: [],
      assets: [
        {
          id: 'asset',
          name: 'Video',
          width: 320,
          height: 180,
          durationMs: 1000,
          hasVideo: true,
          hasAudio: false,
          hasCursor: false,
          zoomCount: 0,
          recording: false,
        },
      ],
      tracks: [{ id: 'video', name: 'Video', kind: 'video', muted: false, hidden: false }],
      clips: [
        {
          id: 'clip',
          assetId: 'asset',
          trackId: 'video',
          startMs: 0,
          sourceInMs: 0,
          durationMs: 1000,
          effects: { opacity: 1, volume: 1, brightness: 0, saturation: 1, scale: 1, x: 0.5, y: 0.5, autoZoom: true },
        },
      ],
    },
    revision: 0,
    canUndo: false,
    canRedo: false,
    recovered: false,
    exportFormats: [],
    transport: { durationMs: 1000, positionMs: 0, playing: false, error: null },
  };
  let transport: Transport = { ...document.transport },
    listener: (event: BeamEvent) => void = () => undefined;
  const unsubscribe = vi.fn();
  const responses = new Map<string, () => Promise<unknown>>();
  const call = vi.fn(async (_service: string, method: string, payload?: Record<string, unknown>) => {
    if (responses.has(method)) return responses.get(method)!();
    if (method === 'frame') return { transport, canvasId: document.project.clips.length ? 42 : null };
    if (method === 'play') return (transport = { ...transport, playing: Boolean(payload?.playing) });
    if (method === 'seek') return (transport = { ...transport, positionMs: Number(payload?.positionMs) });
    if (method === 'edit') {
      document = { ...document, revision: document.revision + 1, canUndo: true };
      return document;
    }
    if (method === 'export') return { phase: 'rendering', progress: 0, error: null };
    if (method === 'exportStatus') return { phase: 'completed', progress: 1, error: null };
    if (method === 'cancelExport') return null;
    return document;
  });
  const api = new EditorApi({ call, onEvent: () => () => {} } as unknown as ApplicationServices);
  const beam = {
    onEvent: (handler: typeof listener) => {
      listener = handler;
      return unsubscribe;
    },
  } as unknown as BeamApi;
  const editor = createRoot((dispose) => {
    disposers.push(dispose);
    return useEditor(api, beam);
  });
  return {
    editor,
    call,
    responses,
    unsubscribe,
    event: (event: BeamEvent) => listener(event),
    setDocument: (value: Snapshot) => (document = value),
    setTransport: (value: Transport) => (transport = value),
  };
}
it('hydrates native state, exposes selection and keeps idle work parked', async () => {
  const { editor, call } = mount();
  await flush();
  expect(editor.snapshot()?.revision).toBe(0);
  expect(editor.busy()).toBe(false);
  editor.select('clip');
  expect(editor.clip()?.id).toBe('clip');
  expect(editor.asset()?.id).toBe('asset');
  expect(editor.canvasId()).toBe(42);
  call.mockClear();
  await vi.advanceTimersByTimeAsync(2000);
  expect(call).not.toHaveBeenCalled();
});
it('serializes edits against the latest revision and supports native document operations', async () => {
  const { editor, call } = mount();
  await flush();
  await Promise.all([editor.edit({ type: 'rename', name: 'First' }), editor.edit({ type: 'rename', name: 'Second' })]);
  expect(call.mock.calls.filter((c) => c[1] === 'edit').map((c) => c[2]?.revision)).toEqual([0, 1]);
  await editor.create();
  await editor.open();
  await editor.import();
  await editor.refresh();
  expect(call.mock.calls.map((c) => c[1])).toEqual(expect.arrayContaining(['new', 'open', 'import', 'retry']));
});
it('keeps the document, preview and controls available during queued small edits', async () => {
  const { editor, responses } = mount();
  await flush();
  editor.select('clip');
  const before = editor.snapshot()!;
  let complete!: (value: Snapshot) => void;
  responses.set('edit', () => new Promise<Snapshot>(resolve => { complete = resolve; }));
  const first = editor.edit({ type: 'rename', name: 'One' });
  const second = editor.edit({ type: 'rename', name: 'Two' });
  await flush();
  expect(editor.saving()).toBe(true);
  expect(editor.busy()).toBe(false);
  expect(editor.loading()).toBe(false);
  expect(editor.snapshot()).toBe(before);
  expect(editor.selected()).toBe('clip');
  expect(editor.canvasId()).toBe(42);
  complete({ ...before, revision: 1 });
  await first;
  await flush();
  expect(editor.saving()).toBe(true);
  expect(editor.busy()).toBe(false);
  complete({ ...before, revision: 2 });
  await second;
  expect(editor.saving()).toBe(false);
});
it('keeps an empty preview out of loading while an edit or quality change is pending', async () => {
  const { editor, responses, setDocument } = mount();
  await flush();
  setDocument({ ...editor.snapshot()!, project: { ...editor.snapshot()!.project, clips: [] } });
  await editor.open();
  await flush();
  const before = editor.snapshot()!;
  for (const method of ['edit', 'quality', 'import'] as const) {
    let complete!: (value: Snapshot) => void;
    responses.set(method, () => new Promise<Snapshot>(resolve => { complete = resolve; }));
    const pending = method === 'edit' ? editor.edit({ type: 'rename', name: 'Empty' }) :
      method === 'quality' ? editor.quality('half') : editor.import();
    await flush();
    expect(editor.loading()).toBe(false);
    expect(editor.busy()).toBe(false);
    expect(editor.saving()).toBe(true);
    expect(editor.snapshot()).toBe(before);
    complete(before);
    await pending;
    expect(editor.saving()).toBe(false);
  }
});
it('retains the last accepted snapshot when a small edit fails and allows the next edit', async () => {
  const { editor, responses } = mount();
  await flush();
  const before = editor.snapshot();
  responses.set('edit', async () => { throw new Error('save failed'); });
  await editor.edit({ type: 'undo' });
  expect(editor.snapshot()).toBe(before);
  expect(editor.busy()).toBe(false);
  expect(editor.saving()).toBe(false);
  expect(editor.error()).toContain('save failed');
  responses.delete('edit');
  await editor.edit({ type: 'rename', name: 'Retry' });
  expect(editor.error()).toBe('');
  expect(editor.snapshot()?.revision).toBe(1);
});
it('clears stale selection and raster when an empty project opens', async () => {
  const { editor, setDocument, responses } = mount();
  await flush();
  editor.select('clip');
  setDocument({ ...editor.snapshot()!, project: { ...editor.snapshot()!.project, assets: [], clips: [] } });
  responses.set('frame', async () => ({ transport: { ...editor.transport(), durationMs: 0 }, canvasId: null }));
  await editor.open();
  await flush();
  expect(editor.clip()).toBeUndefined();
  expect(editor.selected()).toBeUndefined();
  expect(editor.canvasId()).toBeUndefined();
});
it('clamps seeks and restarts playback from the end', async () => {
  const { editor, call, setTransport } = mount();
  await flush();
  await editor.seek(-50);
  await editor.seek(2000);
  expect(call.mock.calls.filter((c) => c[1] === 'seek').map((c) => c[2]?.positionMs)).toEqual([0, 1000]);
  setTransport({ ...editor.transport(), positionMs: 1000 });
  await editor.refresh();
  await flush();
  await editor.toggle();
  expect(call.mock.calls.some((c) => c[1] === 'seek' && c[2]?.positionMs === 0)).toBe(true);
  expect(editor.transport().playing).toBe(true);
  await editor.toggle();
  expect(editor.transport().playing).toBe(false);
});
it('polls only while playing and pauses when the window is hidden', async () => {
  const { editor, call, event } = mount();
  await flush();
  await editor.toggle();
  call.mockClear();
  await vi.advanceTimersByTimeAsync(100);
  expect(call.mock.calls.some((c) => c[1] === 'frame')).toBe(true);
  event({ type: 'windowVisibility', window: 'main', visible: false });
  await flush();
  expect(editor.transport().playing).toBe(false);
  call.mockClear();
  await vi.advanceTimersByTimeAsync(200);
  expect(call).not.toHaveBeenCalled();
  event({ type: 'windowVisibility', window: 'main', visible: true });
  await flush();
  expect(call).toHaveBeenCalledWith('editor', 'frame');
});
it('tracks export completion, cancellation, and explicit failures', async () => {
  const { editor, responses, call } = mount();
  await flush();
  await editor.startExport('webm');
  expect(editor.exportStatus().phase).toBe('rendering');
  await vi.advanceTimersByTimeAsync(260);
  expect(editor.exportStatus().phase).toBe('completed');
  editor.cancelExport();
  await flush();
  expect(call.mock.calls.some((c) => c[1] === 'cancelExport')).toBe(true);
  responses.set('export', async () => {
    throw new Error('missing encoder');
  });
  await editor.startExport('mp4');
  expect(editor.error()).toContain('missing encoder');
  editor.clearError();
  responses.set('export', async () => {
    throw new Error('Cancelled');
  });
  await editor.startExport('mp4');
  expect(editor.error()).toBe('');
});
it('surfaces native failures and ignores cancelled file dialogs', async () => {
  const { editor, responses } = mount();
  await flush();
  responses.set('open', async () => {
    throw new Error('corrupt document');
  });
  await editor.open();
  expect(editor.error()).toContain('corrupt document');
  expect(editor.busy()).toBe(false);
  editor.clearError();
  responses.set('open', async () => {
    throw new Error('Cancelled');
  });
  await editor.open();
  expect(editor.error()).toBe('');
  responses.set('seek', async () => {
    throw new Error('seek failed');
  });
  await editor.seek(20);
  expect(editor.error()).toContain('seek failed');
  responses.set('play', async () => {
    throw new Error('play failed');
  });
  await editor.toggle();
  expect(editor.error()).toContain('play failed');
});
it('surfaces frame and export polling errors without fabricating state', async () => {
  const { editor, responses } = mount();
  await flush();
  responses.set('frame', async () => {
    throw new Error('frame failed');
  });
  await editor.seek(20);
  expect(editor.error()).toContain('frame failed');
  responses.set('exportStatus', async () => {
    throw new Error('export status failed');
  });
  await editor.startExport('mp4');
  await vi.advanceTimersByTimeAsync(260);
  expect(editor.error()).toContain('export status failed');
  responses.set('cancelExport', async () => {
    throw new Error('cancel failed');
  });
  editor.cancelExport();
  await flush();
  expect(editor.error()).toContain('cancel failed');
});
it('disposes subscriptions and rejects late UI updates and queued work', async () => {
  const { editor, responses, unsubscribe } = mount();
  await flush();
  let resolve: ((value: Snapshot) => void) | undefined;
  responses.set('open', () => new Promise<Snapshot>((done) => (resolve = done)));
  const before = editor.snapshot()!;
  const pending = editor.open();
  await flush();
  const queued = editor.create();
  disposers.pop()!();
  expect(unsubscribe).toHaveBeenCalledOnce();
  resolve!({ ...before, revision: 500 });
  await pending;
  await queued;
  expect(editor.snapshot()?.revision).toBe(before.revision);
});
it.each([false, true])('drops in-flight raster responses after disposal, failure=%s', async (failure) => {
  const { editor, responses } = mount();
  await flush();
  let resolve: ((value: unknown) => void) | undefined, reject: ((error: Error) => void) | undefined;
  responses.set(
    'frame',
    () =>
      new Promise((done, failed) => {
        resolve = done;
        reject = failed;
      }),
  );
  const pending = editor.seek(10);
  await flush();
  await editor.seek(20);
  const before = editor.canvasId();
  disposers.pop()!();
  if (failure) reject!(new Error('late failure'));
  else
    resolve!({
      transport: { durationMs: 1000, positionMs: 500, playing: true, error: null },
      image: { kind: 'image', id: 99 },
    });
  await pending;
  expect(editor.canvasId()).toEqual(before);
  expect(editor.error()).toBe('');
});
it('preserves selection on refresh and reports native visibility pause failure', async () => {
  const { editor, responses, event } = mount();
  await flush();
  editor.select('clip');
  await editor.refresh();
  await flush();
  expect(editor.selected()).toBe('clip');
  await editor.toggle();
  responses.set('play', async () => {
    throw new Error('pause failed');
  });
  event({ type: 'windowVisibility', window: 'main', visible: false });
  await flush();
  expect(editor.error()).toContain('pause failed');
});
it('changes quality only after native success, preserving errors and the previous quality', async () => {
  const { editor, responses } = mount(); await flush(); const before = editor.snapshot()!;
  responses.set('quality', async () => before); await editor.quality('half'); expect(editor.previewQuality()).toBe('half');
  responses.set('quality', async () => { throw new Error('GPU unavailable'); }); await editor.quality('quarter');
  expect(editor.previewQuality()).toBe('half'); expect(editor.error()).toContain('GPU unavailable');
});
it('selects inserted clips and clears selection when switching sequence', async () => {
  const { editor, responses } = mount(); await flush(); const before = editor.snapshot()!;
  const clip = { ...before.project.clips[0], id: 'new' };
  responses.set('edit', async () => ({ ...before, project: { ...before.project, clips: [...before.project.clips, clip] } }));
  await editor.edit({ type: 'insert', assetId: 'asset', trackId: 'video', startMs: 1000 }); expect(editor.selected()).toBe('new');
  responses.set('edit', async () => ({ ...before, activeSequence: 'other' }));
  await editor.edit({ type: 'selectSequence', id: 'other' }); expect(editor.selected()).toBeUndefined();
});
