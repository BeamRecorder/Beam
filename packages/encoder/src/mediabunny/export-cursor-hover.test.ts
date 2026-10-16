import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareExportCursorHovers } from './export-cursor-hover';
import { snapshot } from '../../../runtime/src/rendering/tests/render.test-support';
import type { ExportRequest } from '../export-types';
import type { ExportAssets } from './export-worker-assets';
import { isVisualClip } from '@beam/engine/shared/composition-types';
const state = vi.hoisted(() => ({ analyze: vi.fn(), read: vi.fn(), write: vi.fn() }));
vi.mock('@beam/runtime/cursor/hover/hover-analysis', () => ({ analyzeCursorHovers: state.analyze }));
vi.mock('@beam/runtime/cursor/hover/hover-analysis-cache', () => ({
  hoverCacheKey: vi.fn(async () => 'key'),
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
  state.read.mockResolvedValue(undefined);
  state.write.mockResolvedValue(undefined);
});
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
  it('surfaces analysis failure and cancellation instead of exporting a different cursor path', async () => {
    const f = fixture();
    state.analyze.mockRejectedValueOnce(new Error('decoder lost'));
    await expect(prepareExportCursorHovers(f.request, f.assets, f.signal)).rejects.toThrow('decoder lost');
    const cancelled = new AbortController();
    cancelled.abort();
    await expect(prepareExportCursorHovers(f.request, f.assets, cancelled.signal)).rejects.toThrow();
  });
});
