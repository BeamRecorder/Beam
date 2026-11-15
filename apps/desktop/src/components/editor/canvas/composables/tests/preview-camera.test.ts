// @vitest-environment node
import { expect, it } from 'vitest';
import { createComposition } from '@beam/engine/commands/clip-engine';
import { createDefaultClipAppearance } from '@beam/engine/shared/composition-defaults';
import type { VisualClip } from '@beam/engine/shared/composition-types';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';
import { DEFAULT_ZOOM_AUTO_FOLLOW } from '@beam/engine/zoom/zoom-types';
import { DEFAULT_OUTPUT_CANVAS } from '@beam/engine/layout/output-canvas';
import { createDefaultCursorPresentation } from '@beam/engine/capture/cursor-presentation';
import { createCompositionSnapshot } from '@beam/runtime/rendering/snapshot';
import { createSnapshotCameraEvaluator } from '@beam/runtime/rendering/snapshot-camera';
import { createPreviewCamera } from '../preview-camera';
import { experimentalScreenGeometry } from '@beam/engine/zoom/experimental/experimental-camera-geometry';
import type { PreviewCameraInputs } from '../preview-camera-types';

const screen = (): VisualClip => ({
  id: 'screen',
  kind: 'screen',
  name: 'Recording',
  assetId: 'asset',
  timelineStartMs: 1000,
  timelineDurationMs: 8000,
  sourceInMs: 2000,
  sourceDurationMs: 16000,
  playbackRate: 2,
  enabled: true,
  order: 0,
  trackId: 'screen',
  transform: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
  crop: { x: 0.1, y: 0.05, width: 0.8, height: 0.85 },
  appearance: createDefaultClipAppearance('screen'),
  isMirrored: false,
  isMirroredY: false,
});
const zoom: ZoomElement = {
  id: 'zoom',
  sessionId: 'session',
  startMs: 1500,
  endMs: 7000,
  depth: 3,
  focus: { cx: 0.4, cy: 0.4 },
  mode: 'auto',
};
const fixture = (): PreviewCameraInputs => {
  const clip = screen();
  return {
    options: {
      isPlaying: () => true,
      editorData: () => null,
      zoomAutoFollow: () => ({ ...DEFAULT_ZOOM_AUTO_FOLLOW, experimentalZoom: true }),
    },
    selectedZoom: null,
    zooms: [zoom],
    telemetry: [
      { timeMs: 0, cx: 0.1, cy: 0.1 },
      { timeMs: 20000, cx: 0.9, cy: 0.9 },
    ],
    composition: createComposition(
      [
        {
          id: 'asset',
          kind: 'video',
          name: 'Recording',
          fileName: 'video.mp4',
          src: '/video.mp4',
          durationMs: 20000,
          width: 1920,
          height: 1080,
          origin: 'session',
          sessionId: 'session',
          sessionStartMs: 5000,
        },
      ],
      [clip],
    ),
    output: { ...DEFAULT_OUTPUT_CANVAS, showBackground: true },
    videoWidth: 1920,
    videoHeight: 1080,
    dw: 960,
    dh: 540,
    screenAt: (time) => (time >= 1000 && time < 9000 ? clip : null),
  };
};
it.each([true, false])(
  'shares preview/export crop, camera clocks and geometry with background %s',
  (showBackground) => {
    const input = fixture();
    input.output.showBackground = showBackground;
    const snapshot = createCompositionSnapshot({
      duration: 10,
      fps: 30,
      canvas: input.output,
      background: null,
      blurPercent: 0,
      editorData: null,
      zooms: input.zooms,
      zoomAutoFollow: input.options.zoomAutoFollow!(),
      composition: input.composition,
      cursorSettings: createDefaultCursorPresentation(),
      cursorPack: null,
    });
    snapshot.cursor.telemetry = [...input.telemetry];
    const preview = createPreviewCamera(input),
      exported = createSnapshotCameraEvaluator(snapshot, 1920, 1080);
    for (const time of [0, 1500, 1666.67, 2700, 4500, 6100, 8000, 3000]) {
      const a = preview.sample(time),
        b = exported.sample(time);
      expect(a.scale).toBeCloseTo(b.scale, 10);
      expect(a.focus.cx).toBeCloseTo(b.focus.cx, 10);
      expect(a.focus.cy).toBeCloseTo(b.focus.cy, 10);
    }
  },
);
it('uses frame media insets for phone frames at either canvas resolution', () => {
  const clip = screen();
  clip.appearance.frame = 'iphone-16-max';
  const large = experimentalScreenGeometry(clip, 1920, 1080, 1920, 1080, true),
    small = experimentalScreenGeometry(clip, 1920, 1080, 960, 540, true);
  expect(small.crop).toEqual(large.crop);
  expect(small.mask.width).toBeLessThan(0.8);
  expect(small.mask).toEqual(large.mask);
});
it('retains the standard painter’s manual-edit and source-focus mapping', () => {
  const input = fixture();
  input.options.zoomAutoFollow = () => ({ ...DEFAULT_ZOOM_AUTO_FOLLOW });
  input.options.isPlaying = () => false;
  input.selectedZoom = { ...zoom, mode: 'manual' };
  input.zooms = [input.selectedZoom];
  expect(createPreviewCamera(input).sample(4000).scale).toBe(1);
  input.options.isPlaying = () => true;
  expect(createPreviewCamera(input).sample(4000).scale).toBeGreaterThan(1);
  input.selectedZoom = null;
  input.zooms = [zoom];
  expect(createPreviewCamera(input).sample(4000).scale).toBeGreaterThan(1);
  input.screenAt = () => null;
  expect(createPreviewCamera(input).sample(4000).scale).toBeGreaterThan(1);
});
it('resolves standard phone frame content separately from its outer bezel', () => {
  const input = fixture(),
    clip = screen();
  clip.appearance.frame = 'iphone-16-max';
  input.options.zoomAutoFollow = () => ({ ...DEFAULT_ZOOM_AUTO_FOLLOW });
  input.screenAt = () => clip;
  const sample = createPreviewCamera(input).sample(4000);
  expect(sample.scale).toBeGreaterThan(1);
  expect(Number.isFinite(sample.focus.cx)).toBe(true);
});
