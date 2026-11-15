import { RecordlySpatialFilter } from './spatial-filter';
import { drawRecordlyVideoLayer, disposeRecordlyVideoLayer } from './video-layer';
import type { RecordlyFrameEffect } from '@beam/engine/zoom/experimental/recordly-camera-types';
import { createCompositionSnapshot } from '../../rendering/snapshot';
import { renderCompositionFrame, disposeCompositionRenderer } from '../../rendering/render';
import { createSnapshotCameraEvaluator } from '../../rendering/snapshot-camera';
import { emptyComposition } from '@beam/engine/shared/composition-types';
import { createDefaultClipAppearance } from '@beam/engine/shared/composition-defaults';
import { createDefaultCursorPresentation } from '@beam/engine/capture/cursor-presentation';
import { DEFAULT_OUTPUT_CANVAS } from '@beam/engine/layout/output-canvas';
import { DEFAULT_ZOOM_AUTO_FOLLOW } from '@beam/engine/zoom/zoom-types';
import { normalizeRecordlyZoom } from '@beam/engine/zoom/recordly-settings';

const check = (valid: unknown, message: string) => {
  if (!valid) throw new Error(message);
};
const context = (canvas: OffscreenCanvas) => {
  const result = canvas.getContext('2d');
  if (!result) throw new Error('Canvas2D required.');
  return result;
};
const pixels = (canvas: OffscreenCanvas) => context(canvas).getImageData(0, 0, canvas.width, canvas.height).data;
const read = (source: CanvasImageSource, width: number, height: number) => {
  const canvas = new OffscreenCanvas(width, height);
  context(canvas).drawImage(source, 0, 0);
  return pixels(canvas);
};
const effect = (): RecordlyFrameEffect => ({
  transform: { scale: 1, x: 0, y: 0 },
  width: 96,
  height: 64,
  pan: { velocity: { x: 0, y: 0 }, kernelSize: 13, offset: 0 },
  zoom: { center: { x: 28, y: 24 }, strength: 0, innerRadius: 0, radius: -1 },
});

/** Small real-WebGL probe. Kept outside Vitest because its mock DOM cannot compile or render shaders. */
export function runRecordlyRender() {
  const width = 96,
    height = 64,
    source = new OffscreenCanvas(width, height),
    ctx = context(source);
  ctx.fillStyle = 'rgba(220,50,10,.8)';
  ctx.fillRect(0, 0, width, height / 2);
  ctx.fillStyle = '#1234ee';
  ctx.fillRect(0, height / 2, width, height / 2);
  ctx.fillStyle = '#fff';
  for (let x = 8; x < width; x += 16) ctx.fillRect(x, 8, 3, height - 16);
  const original = pixels(source),
    filter = new RecordlySpatialFilter(),
    checks: string[] = [];
  try {
    const identity = read(filter.draw(source, effect()), width, height);
    check(
      identity.every((value, index) => value === original[index]),
      'Identity altered alpha, orientation or pixels',
    );
    checks.push('identity and premultiplied alpha');
    for (const velocity of [
      { x: 8, y: 3 },
      { x: -8, y: -3 },
    ]) {
      const input = effect();
      input.pan.velocity = velocity;
      input.pan.offset = -Math.hypot(velocity.x, velocity.y) / 32;
      const output = read(filter.draw(source, input), width, height);
      check(
        output.some((value, index) => Math.abs(value - original[index]!) > 20),
        'Directional kernel inactive',
      );
      check(output[3]! < original[3]!, 'Directional edges must sample transparent padding');
      checks.push(`directional ${velocity.x}`);
    }
    const input = effect();
    input.zoom.strength = 0.16;
    const radial = read(filter.draw(source, input), width, height);
    check(
      radial.some((value, index) => Math.abs(value - original[index]!) > 20),
      'Radial kernel inactive',
    );
    checks.push('radial kernel');
    const clean = read(filter.draw(source, effect()), width, height);
    check(
      clean.every((value, index) => value === original[index]),
      'Old blur pixels survived texture reuse',
    );
    checks.push('texture reuse clears padding');
  } finally {
    filter.dispose();
  }
  const target = new OffscreenCanvas(120, 80),
    targetContext = context(target),
    input = effect();
  input.pan.velocity = { x: 8, y: 0 };
  input.pan.offset = -0.25;
  targetContext.translate(8, 4);
  const base = targetContext.getTransform();
  targetContext.translate(20, 10);
  drawRecordlyVideoLayer(targetContext, base, 96, 64, input, (layer, pass) => {
    layer.fillStyle = pass === 'shadow' ? '#00ff00' : '#ff0000';
    if (pass === 'shadow') layer.fillRect(0, 40, 1, 1);
    else layer.fillRect(0, 0, 25, 20);
  });
  const pixel = pixels(target),
    shadow = (54 * 120 + 28) * 4;
  check(
    pixel[shadow] === 0 && pixel[shadow + 1] === 255 && pixel[shadow + 3] === 255,
    'Shadow entered spatial filter or moved into stage coordinates',
  );
  checks.push('shadow outside filter and translated stage');
  disposeRecordlyVideoLayer();
  const composition = emptyComposition();
  composition.assets.push({
    id: 'asset',
    name: 'recording',
    kind: 'video',
    src: 'memory:screen',
    fileName: null,
    width: 96,
    height: 64,
    durationMs: 6000,
    origin: 'session',
    sessionId: 's',
  });
  composition.clips.push({
    id: 'screen',
    name: 'recording',
    kind: 'screen',
    assetId: 'asset',
    timelineStartMs: 0,
    timelineDurationMs: 6000,
    sourceInMs: 0,
    sourceDurationMs: 6000,
    playbackRate: 1,
    enabled: true,
    order: 0,
    transform: { x: 0.2, y: 0.2, width: 0.6, height: 0.6 },
    appearance: { ...createDefaultClipAppearance('screen'), shadowSize: 'none', cornerRadius: 'none' },
    isMirrored: false,
    isMirroredY: false,
  });
  const background = new OffscreenCanvas(128, 96),
    bc = context(background),
    gradient = bc.createLinearGradient(0, 0, 128, 0);
  gradient.addColorStop(0, 'red');
  gradient.addColorStop(1, 'blue');
  bc.fillStyle = gradient;
  bc.fillRect(0, 0, 128, 96);
  const makeSnapshot = (zoomBackground: boolean) =>
    createCompositionSnapshot({
      duration: 6,
      fps: 60,
      canvas: { ...DEFAULT_OUTPUT_CANVAS, width: 128, height: 96, showBackground: true },
      background: null,
      blurPercent: 0,
      editorData: null,
      zooms: [
        { id: 'zoom', sessionId: 's', startMs: 0, endMs: 6000, depth: 3, mode: 'manual', focus: { cx: 0.5, cy: 0.5 } },
      ],
      zoomAutoFollow: {
        ...DEFAULT_ZOOM_AUTO_FOLLOW,
        experimentalZoom: true,
        zoomBackground,
        recordly: normalizeRecordlyZoom({ zoomMotionBlur: 0 }),
      },
      composition,
      cursorSettings: createDefaultCursorPresentation(),
      cursorPack: null,
    });
  const fixed = new OffscreenCanvas(128, 96),
    moving = new OffscreenCanvas(128, 96);
  const fixedSnapshot = makeSnapshot(false),
    movingSnapshot = makeSnapshot(true);
  try {
    for (const [canvas, snapshot] of [
      [fixed, fixedSnapshot],
      [moving, movingSnapshot],
    ] as const) {
      const evaluator = createSnapshotCameraEvaluator(snapshot, 96, 64);
      renderCompositionFrame(
        context(canvas),
        { source, width: 96, height: 64 },
        snapshot,
        2,
        { source: background, width: 128, height: 96, preRendered: true },
        undefined,
        undefined,
        undefined,
        evaluator,
      );
    }
    const a = pixels(fixed),
      b = pixels(moving),
      expected = pixels(background);
    check(a[0] === expected[0] && a[2] === expected[2], 'Fixed background was transformed with camera');
    check(Math.abs(a[0]! - b[0]!) > 15, 'Explicit moving background ignored');
    checks.push('independent fixed/moving background');
    const preview = new OffscreenCanvas(128, 96),
      evaluator = createSnapshotCameraEvaluator(fixedSnapshot, 96, 64);
    const camera = evaluator.compose!({ timeMs: 2000, isPlaying: false, shouldSnapPausedFrame: true });
    renderCompositionFrame(
      context(preview),
      { source, width: 96, height: 64 },
      fixedSnapshot,
      2,
      { source: background, width: 128, height: 96, preRendered: true },
      undefined,
      undefined,
      undefined,
      evaluator,
      undefined,
      { camera, cursorMotion: null },
    );
    const p = pixels(preview);
    check(
      p.every((value, index) => Math.abs(value - a[index]!) <= 1),
      'Prepared preview/export layer transforms differ',
    );
    checks.push('preview/export prepared frame');
  } finally {
    disposeCompositionRenderer();
  }
  return { checks, renderer: 'WebGL2', pixels: width * height };
}
Object.assign(globalThis, { runRecordlyRender });
