import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OUTPUT_CANVAS } from '../../../video-editor/canvas/output-canvas';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import type { ClipComposition, MediaAsset, VisualClip } from '~/media/shared/composition-types';
import type { ExportRequest } from '../../export-types';

const runtime = vi.hoisted(() => ({
  openMediaInput: vi.fn(),
  mixCompositionAudio: vi.fn(async () => null),
}));

vi.mock('~/media/shared', async () => ({
  ...(await vi.importActual<typeof import('~/media/shared')>('~/media/shared')),
  openMediaInput: runtime.openMediaInput,
}));
vi.mock('~/media/export', async () => ({
  ...(await vi.importActual<typeof import('~/media/export')>('~/media/export')),
  mixCompositionAudio: runtime.mixCompositionAudio,
}));

import { prepareExport } from '../export-preflight';

const asset = (id: string, kind: MediaAsset['kind'] = 'video', fileName = `${id}.mp4`): MediaAsset => ({
  id,
  kind,
  name: id,
  fileName,
  durationMs: 2_000,
  width: kind === 'audio' ? null : 1_280,
  height: kind === 'audio' ? null : 720,
  src: `project-media://asset/${fileName}`,
  origin: 'project',
});

const visual = (id: string, assetId: string, kind: VisualClip['kind'] = 'video', enabled = true): VisualClip => ({
  id,
  kind,
  name: id,
  assetId,
  timelineStartMs: 0,
  timelineDurationMs: 2_000,
  sourceInMs: 0,
  sourceDurationMs: 2_000,
  playbackRate: 1,
  enabled,
  order: 0,
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance(kind),
  isMirrored: false,
  isMirroredY: false,
});

const request = (composition: ClipComposition): ExportRequest => ({
  projectName: 'Preflight',
  format: 'webm',
  preset: 'medium',
  snapshot: {
    duration: 2,
    render: { fps: 30, sourceWidth: null, sourceHeight: null },
    canvas: { ...DEFAULT_OUTPUT_CANVAS },
    background: null,
    blurPercent: 0,
    zooms: [],
    cursor: { available: false, events: [], telemetry: [], shapes: {}, catalog: {}, missing: [] },
    cursorSettings: {
      selectedCursor: 'automatic',
      size: 45,
      color: '#000000',
      shadow: { enabled: true, blur: 6, color: '#000000', direction: 'bottom' },
      clickEffects: {
        left: { springEnabled: true, springIntensity: 50, rippleEnabled: true, rippleSize: 30, rippleColor: '#f00' },
        right: { springEnabled: true, springIntensity: 50, rippleEnabled: true, rippleSize: 30, rippleColor: '#00f' },
      },
      motion: { preset: 'smooth', smoothing: 0.67, springMassMultiplier: 1.29, motionBlur: 0.4 },
    },
    composition,
  },
});

const openedVideo = (fps: number) => {
  const track = {
    canDecode: vi.fn(async () => true),
    getCodec: vi.fn(async () => 'vp9'),
    computePacketStats: vi.fn(async () => ({ averagePacketRate: fps })),
    getDisplayWidth: vi.fn(async () => 1_280),
    getDisplayHeight: vi.fn(async () => 720),
  };
  return {
    input: {
      getPrimaryVideoTrack: vi.fn(async () => track),
      computeDuration: vi.fn(async () => 2),
    },
    dispose: vi.fn(),
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  runtime.openMediaInput.mockImplementation(async (descriptor: { assetId: string }) =>
    openedVideo(descriptor.assetId === 'fast' ? 60 : 24),
  );
});

describe('export preflight', () => {
  it('uses the maximum measured FPS and keeps screen dimensions', async () => {
    const composition: ClipComposition = {
      schemaVersion: 2,
      assets: [asset('slow'), asset('fast')],
      clips: [visual('screen', 'slow', 'screen'), visual('overlay', 'fast')],
    };
    const prepared = await prepareExport(request(composition));
    expect(prepared.fps).toBe(60);
    expect(prepared.screenSize).toEqual({ width: 1_280, height: 720 });
    expect(runtime.openMediaInput).toHaveBeenCalledTimes(2);
  });

  it('uses exactly 30 FPS when no active video exists', async () => {
    const prepared = await prepareExport(request({ schemaVersion: 2, assets: [], clips: [] }));
    expect(prepared.fps).toBe(30);
    expect(runtime.openMediaInput).not.toHaveBeenCalled();
  });

  it('rejects active missing assets but ignores disabled broken assets', async () => {
    const disabled = visual('disabled', 'missing', 'video', false);
    await expect(prepareExport(request({ schemaVersion: 2, assets: [], clips: [disabled] }))).resolves.toMatchObject({
      fps: 30,
    });

    const active = { ...disabled, id: 'active', enabled: true };
    await expect(prepareExport(request({ schemaVersion: 2, assets: [], clips: [active] }))).rejects.toMatchObject({
      issue: { code: 'missing-asset', clipId: 'active' },
    });
  });

  it('rejects GIFs and unavailable frame rates explicitly', async () => {
    const gif = asset('gif', 'image', 'animation.gif');
    await expect(
      prepareExport(request({ schemaVersion: 2, assets: [gif], clips: [visual('gif-clip', gif.id, 'image')] })),
    ).rejects.toMatchObject({ issue: { code: 'unsupported-format', message: 'GIF not supported' } });

    runtime.openMediaInput.mockResolvedValueOnce(openedVideo(Number.NaN));
    const video = asset('broken-fps');
    await expect(
      prepareExport(request({ schemaVersion: 2, assets: [video], clips: [visual('video', video.id)] })),
    ).rejects.toMatchObject({ issue: { code: 'fps-unavailable', assetId: 'broken-fps' } });
  });
});
