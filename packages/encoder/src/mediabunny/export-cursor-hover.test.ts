import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareExportCursorHovers } from './export-cursor-hover';
import { snapshot } from '../../../runtime/src/rendering/tests/render.test-support';
import type { ExportRequest } from '../export-types';
import type { ExportAssets } from './export-worker-assets';
import { isVisualClip } from '@beam/engine/shared/composition-types';
const state = vi.hoisted(() => ({ analyze: vi.fn(), key: vi.fn(), read: vi.fn(), write: vi.fn() }));
vi.mock('@beam/runtime/cursor/hover/hover-analysis', () => ({ analyzeCursorHovers: state.analyze }));
vi.mock('@beam/runtime/cursor/hover/hover-analysis-cache', () => ({
  hoverCacheKey: state.key,
  readHoverCache: state.read,
  writeHoverCache: state.write,
}));
const sync = { version: 1, ranges: [{ startSeconds: 0, endSeconds: 1 }] };
function fixture() {
  const request: ExportRequest = { projectName: 'test', format: 'mp4', preset: 'high', snapshot: snapshot() };
  request.snapshot.cursor.available = true;
  request.snapshot.cursorSettings.enabled = true;
  request.snapshot.cursor.events = [
    { event: 'move', sessionNs: 0, normalizedX: 0.5, normalizedY: 0.5, pixelX: 10, pixelY: 10, visible: true },
  ];
  const asset = request.snapshot.composition.assets[0]!;
  asset.src = 'https://localhost/screen.mp4';
  const assets = { assets: new Map([[asset.id, { asset, duration: 1 }]]) } as ExportAssets;
  return { request, assets, signal: new AbortController().signal };
}
beforeEach(() => {
  vi.clearAllMocks();
  state.analyze.mockResolvedValue(sync);
  state.key.mockResolvedValue('key');
  state.read.mockResolvedValue(undefined);
  state.write.mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());
describe('export cursor synchronization', () => {
  it('waits for analysis and enriches a copy before rendering', async () => {
    const f = fixture();
    const enriched = await prepareExportCursorHovers(f.request, f.assets, f.signal);
    expect(enriched.snapshot.cursor.hoverSync).toEqual(sync);
    expect(f.request.snapshot.cursor.hoverSync).toBeUndefined();
    expect(state.analyze).toHaveBeenCalledOnce();
    expect(state.write).toHaveBeenCalledWith('key', sync);
  });
  it('sorts session assets on their recording clock and bounds each source duration', async () => {
    const f = fixture();
    const first = f.request.snapshot.composition.assets[0]!;
    const next = { ...first, id: 'next', sessionStartMs: 7000, durationMs: 2000 };
    const clip = f.request.snapshot.composition.clips.find(isVisualClip)!;
    f.request.snapshot.composition.clips.push({ ...clip, id: 'next-clip', assetId: 'next' });
    f.assets.assets = new Map([
      ['next', { asset: next, duration: 3 }],
      [first.id, { asset: first, duration: 1 }],
    ]) as ExportAssets['assets'];
    await prepareExportCursorHovers(f.request, f.assets, f.signal);
    expect(
      state.analyze.mock.calls[0]![0].sources.map((source: { startSeconds: number; durationSeconds: number }) => [
        source.startSeconds,
        source.durationSeconds,
      ]),
    ).toEqual([
      [0, 1],
      [7, 2],
    ]);
  });
  it('uses complete original screen segments supplied by the editor, including removed timeline sections', async () => {
    const f = fixture();
    f.request.snapshot.cursor.hoverSources = [
      { id: 'original', src: 'https://localhost/original.mp4', startSeconds: 5, durationSeconds: 8 },
    ];
    await prepareExportCursorHovers(f.request, f.assets, f.signal);
    expect(state.analyze.mock.calls[0]![0].sources).toEqual(f.request.snapshot.cursor.hoverSources);
  });
  it('reuses editor analysis or cached analysis without decoding again', async () => {
    const f = fixture();
    f.request.snapshot.cursor.hoverSync = sync as typeof f.request.snapshot.cursor.hoverSync;
    expect(await prepareExportCursorHovers(f.request, f.assets, f.signal)).toBe(f.request);
    delete f.request.snapshot.cursor.hoverSync;
    state.read.mockResolvedValue(sync);
    expect((await prepareExportCursorHovers(f.request, f.assets, f.signal)).snapshot.cursor.hoverSync).toEqual(sync);
    expect(state.analyze).not.toHaveBeenCalled();
  });
  it('skips disabled smoothing, embedded cursors, unavailable telemetry and imported footage', async () => {
    for (const kind of ['disabled', 'smoothing', 'empty', 'unavailable', 'embedded', 'imported']) {
      const f = fixture();
      if (kind === 'disabled') f.request.snapshot.cursorSettings.enabled = false;
      if (kind === 'smoothing') f.request.snapshot.cursorSettings.motion.smoothing = 0;
      if (kind === 'empty') f.request.snapshot.cursor.events = [];
      if (kind === 'unavailable') f.request.snapshot.cursor.available = false;
      if (kind === 'embedded') f.request.snapshot.cursor.hoverSources = [];
      if (kind === 'imported') f.request.snapshot.composition.assets[0]!.origin = 'project';
      expect(await prepareExportCursorHovers(f.request, f.assets, f.signal)).toBe(f.request);
    }
    expect(state.analyze).not.toHaveBeenCalled();
  });
  it.each(['decoder lost', 'WebGL unavailable', 'Cursor synchronization decoder timed out.'])(
    'continues with the configured cursor after optional analysis fails: %s',
    async (message) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const f = fixture();
      const before = structuredClone(f.request);
      const error = new Error(message);
      state.analyze.mockRejectedValueOnce(error);
      expect(await prepareExportCursorHovers(f.request, f.assets, f.signal)).toBe(f.request);
      expect(f.request).toEqual(before);
      expect(f.request.snapshot.cursor.hoverSync).toBeUndefined();
      expect(state.write).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledExactlyOnceWith(
        '[Beam export] Hover synchronization skipped; retaining configured cursor smoothing.',
        error,
      );
    },
  );
  it.each(['key', 'read', 'write'] as const)('keeps optional cache %s failures from blocking export', async (stage) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = fixture();
    const error = new Error(`cache ${stage} failed`);
    state[stage].mockRejectedValueOnce(error);
    expect(await prepareExportCursorHovers(f.request, f.assets, f.signal)).toBe(f.request);
    expect(warn).toHaveBeenCalledOnce();
    expect(f.request.snapshot.cursor.hoverSync).toBeUndefined();
    if (stage !== 'write') expect(state.write).not.toHaveBeenCalled();
    if (stage === 'key') expect(state.read).not.toHaveBeenCalled();
  });
  it('does not cache a failed analysis and retries it on a later export', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = fixture();
    state.analyze.mockRejectedValueOnce(new Error('decoder lost'));
    expect(await prepareExportCursorHovers(f.request, f.assets, f.signal)).toBe(f.request);
    expect(state.write).not.toHaveBeenCalled();
    expect((await prepareExportCursorHovers(f.request, f.assets, f.signal)).snapshot.cursor.hoverSync).toEqual(sync);
    expect(state.analyze).toHaveBeenCalledTimes(2);
    expect(state.write).toHaveBeenCalledExactlyOnceWith('key', sync);
  });
  it('retains smoothing after a non-Error analysis rejection', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = fixture();
    state.analyze.mockRejectedValueOnce(undefined);
    expect(await prepareExportCursorHovers(f.request, f.assets, f.signal)).toBe(f.request);
    expect(warn).toHaveBeenCalledOnce();
    expect(state.write).not.toHaveBeenCalled();
  });
  it('propagates cancellation before optional preparation or an already completed analysis', async () => {
    const f = fixture();
    const cancelled = new AbortController();
    const reason = new Error('User cancelled');
    cancelled.abort(reason);
    await expect(prepareExportCursorHovers(f.request, f.assets, cancelled.signal)).rejects.toBe(reason);
    f.request.snapshot.cursor.hoverSync = sync as typeof f.request.snapshot.cursor.hoverSync;
    await expect(prepareExportCursorHovers(f.request, f.assets, cancelled.signal)).rejects.toBe(reason);
    expect(state.key).not.toHaveBeenCalled();
    expect(state.analyze).not.toHaveBeenCalled();
  });
  it.each(['key', 'read', 'analyze', 'write'] as const)(
    'cancellation during %s stops export rather than continuing without synchronization',
    async (stage) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const f = fixture();
      const controller = new AbortController();
      const reason = new Error('User cancelled');
      state[stage].mockImplementationOnce(async () => {
        controller.abort(reason);
        throw new Error('Stage rejected after cancellation');
      });
      await expect(prepareExportCursorHovers(f.request, f.assets, controller.signal)).rejects.toBe(reason);
      expect(warn).not.toHaveBeenCalled();
      expect(f.request.snapshot.cursor.hoverSync).toBeUndefined();
      if (stage !== 'write') expect(state.write).not.toHaveBeenCalled();
    },
  );
  it.each(['key', 'read', 'analyze', 'write'] as const)(
    'checks cancellation after successful %s work',
    async (stage) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const f = fixture();
      const controller = new AbortController();
      const reason = new Error('User cancelled');
      state[stage].mockImplementationOnce(async () => {
        controller.abort(reason);
        return stage === 'key' ? 'key' : stage === 'write' ? undefined : sync;
      });
      await expect(prepareExportCursorHovers(f.request, f.assets, controller.signal)).rejects.toBe(reason);
      expect(warn).not.toHaveBeenCalled();
      expect(f.request.snapshot.cursor.hoverSync).toBeUndefined();
      if (stage !== 'analyze' && stage !== 'write') expect(state.analyze).not.toHaveBeenCalled();
    },
  );
});
