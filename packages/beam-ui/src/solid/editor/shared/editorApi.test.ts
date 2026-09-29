import { expect, it, vi } from 'vitest';
import type { ApplicationServices } from '@argui/host';
import { EditorApi } from './editorApi';

it('exposes narrow native commands and keeps all paths out of renderer payloads', async () => {
  const call = vi.fn().mockResolvedValue(null),
    api = new EditorApi({ call } as unknown as ApplicationServices);
  await api.bootstrap();
  await api.create();
  await api.open();
  await api.import();
  await api.snapshot();
  await api.retry();
  await api.edit(3, { type: 'undo' });
  await api.seek(250);
  await api.play(true);
  await api.frame();
  await api.export('mp4');
  await api.exportStatus();
  await api.cancelExport();
  expect(call.mock.calls).toEqual([
    ['editor', 'bootstrap'],
    ['editor', 'new'],
    ['editor', 'open'],
    ['editor', 'import'],
    ['editor', 'snapshot'],
    ['editor', 'retry'],
    ['editor', 'edit', { revision: 3, edit: { type: 'undo' } }],
    ['editor', 'seek', { positionMs: 250 }],
    ['editor', 'play', { playing: true }],
    ['editor', 'frame'],
    ['editor', 'export', { container: 'mp4' }],
    ['editor', 'exportStatus'],
    ['editor', 'cancelExport'],
  ]);
});
it('propagates native errors without fabricating projects or success', async () => {
  const api = new EditorApi({
    call: vi.fn().mockRejectedValue(new Error('missing source')),
  } as unknown as ApplicationServices);
  await expect(api.open()).rejects.toThrow('missing source');
  await expect(api.export('webm')).rejects.toThrow('missing source');
});
it('keeps source previews and quality in narrow native services', async () => {
  const call = vi.fn().mockResolvedValue({ canvasId: 43 }), api = new EditorApi({ call } as unknown as ApplicationServices);
  await api.acquireVisual('p', 'asset', { kind: 'video', positionMs: 1024 }); await api.releaseVisual('key'); await api.quality('quarter');
  expect(call.mock.calls).toEqual([['editor', 'acquireVisual', { projectId: 'p', assetId: 'asset', request: { kind: 'video', positionMs: 1024 } }], ['editor', 'releaseVisual', { key: 'key' }], ['editor', 'quality', { quality: 'quarter' }]]);
});
it('validates source event envelopes and unregisters its listener', () => {
  let callback: (value: unknown) => void = () => {}; const off = vi.fn();
  const api = new EditorApi({ onEvent: (fn: typeof callback) => { callback = fn; return off; } } as unknown as ApplicationServices);
  const listener = vi.fn(); const unsubscribe = api.onVisual(listener);
  for (const value of [null, 0, {}, { type: 'sourceVisual' }, { type: 'sourceVisual', visual: { key: 'k' } }, { type: 'sourceVisual', visual: { key: 'k', canvasId: 2, status: 'wrong', error: null } }]) callback(value);
  expect(listener).not.toHaveBeenCalled(); callback({ type: 'sourceVisual', visual: { key: 'k', canvasId: 2, status: 'ready', error: null } }); expect(listener).toHaveBeenCalledTimes(1); unsubscribe(); expect(off).toHaveBeenCalledOnce();
});
