import { createRuntimePreview } from '../runtime-preview';
import { renderCompositionFrame, disposeCompositionRenderer } from '@beam/runtime/rendering/render';
import { createCompositionSceneLayerResolver } from '@beam/engine/composition/scene-layers';
import { createComposition } from '@beam/engine/commands/clip-engine';
import { createDefaultClipAppearance } from '@beam/engine/shared/composition-defaults';
import { createDefaultCursorPresentation } from '@beam/engine/capture/cursor-presentation';
import { DEFAULT_OUTPUT_CANVAS } from '@beam/engine/layout/output-canvas';
import type { RuntimePreviewOptions } from '../runtime-preview-types';
import type { CursorEvent } from '@beam/engine/capture/capture-session';
import type { MediaFrame } from '@beam/runtime/shared/index';
import { CanvasSource, BufferTarget, Output, WebMOutputFormat } from 'mediabunny';
import { loadPlaybackAsset } from '@beam/runtime/playback/playback-worker-assets';
import { createPlaybackConsumer } from '@beam/runtime/playback/playback-worker-consumers';
import { createPlaybackFrameQueue } from '@beam/runtime/playback/playback-frame-queue';

function canvas(width = 320, height = 180) {
  const surface = document.createElement('canvas');
  surface.width = width;
  surface.height = height;
  const context = surface.getContext('2d')!;
  context.imageSmoothingQuality = 'high';
  return { surface, context };
}

export async function compareFrame(mode: string) {
  const media = canvas();
  media.context.fillStyle = '#e7edfa';
  media.context.fillRect(0, 0, 320, 180);
  media.context.fillStyle = '#182940';
  media.context.font = '16px sans-serif';
  for (let i = 0; i < 6; i++) media.context.fillText(`${i}: 0123456789`, 12, 24 + i * 27);
  const bitmap = await createImageBitmap(media.surface);
  const composition = createComposition(
    [
      {
        id: 'asset',
        kind: 'video',
        name: 'Screen',
        fileName: null,
        durationMs: 2000,
        width: 320,
        height: 180,
        src: 'fixture://screen',
        origin: 'session',
      },
    ],
    [
      {
        id: 'screen',
        trackId: 'screen',
        kind: 'screen',
        assetId: 'asset',
        name: 'Screen',
        enabled: true,
        order: 0,
        timelineStartMs: 0,
        timelineDurationMs: 2000,
        sourceInMs: 0,
        sourceDurationMs: 2000,
        playbackRate: 1,
        transform: { x: 0.07, y: 0.07, width: 0.86, height: 0.86 },
        appearance: createDefaultClipAppearance('screen'),
        isMirrored: false,
        isMirroredY: false,
      },
    ],
  );
  if (mode === 'grouped') {
    composition.scene = {
      version: 1,
      roots: ['group'],
      groups: [
        {
          id: 'group',
          children: ['screen'],
          space: 'scene',
          opacity: 0.7,
          blendMode: 'source-over',
          transform: { x: 0, y: 0, scaleX: 0.96, scaleY: 0.96, rotation: 3 },
        },
      ],
    };
    composition.animations = {
      version: 1,
      tracks: [
        {
          id: 'group-move',
          targetId: 'group',
          property: 'transform.x',
          interpolation: 'number',
          keyframes: [
            { timeMs: 0, value: 0 },
            { timeMs: 2000, value: 0.05 },
          ],
        },
      ],
    };
  }
  const presentation = createDefaultCursorPresentation();
  const events: CursorEvent[] = Array.from({ length: 121 }, (_, i) => ({
    event: 'move',
    sessionNs: Math.round((i / 60) * 1e9),
    pixelX: 64 + i,
    pixelY: 80,
    normalizedX: 0.2 + i / 200,
    normalizedY: 0.45 + Math.sin(i / 20) * 0.1,
    visible: true,
  }));
  const artwork = canvas(32, 32);
  artwork.context.fillStyle = 'white';
  artwork.context.strokeStyle = 'black';
  artwork.context.beginPath();
  artwork.context.moveTo(2, 2);
  artwork.context.lineTo(26, 16);
  artwork.context.lineTo(14, 18);
  artwork.context.lineTo(10, 30);
  artwork.context.closePath();
  artwork.context.fill();
  artwork.context.stroke();
  const image = new Image();
  image.src = artwork.surface.toDataURL();
  await image.decode();
  const frame: MediaFrame = {
    bitmap,
    clipId: 'screen',
    width: 320,
    height: 180,
    timestampSeconds: 0,
    durationSeconds: 2,
    byteSize: 320 * 180 * 4,
    close: () => bitmap.close(),
  };
  const cursor = {
    available: true,
    events,
    telemetry: events.map((event) => ({
      timeMs: event.sessionNs / 1e6,
      cx: 'normalizedX' in event ? event.normalizedX! : 0,
      cy: 'normalizedY' in event ? event.normalizedY! : 0,
    })),
    shapes: {},
    catalog: {},
    missing: [],
  };
  const props: RuntimePreviewOptions['props'] = {
    isPlaying: true,
    currentTime: 0.8,
    duration: 2,
    composition,
    outputCanvas: { ...DEFAULT_OUTPUT_CANVAS, width: 320, height: 180 },
    frameFor: () => frame,
    frameVersion: 1,
    previewQuality: 'full',
    playbackState: 'playing',
    playbackError: null,
    cursorSelection: { packId: 'fixture', mode: 'automatic', cursorId: null },
    cursorPack: {
      id: 'fixture',
      name: 'Fixture',
      source: 'imported',
      colorMode: 'original',
      defaultCursorId: 'arrow',
      automaticMap: { default: 'arrow' },
      cursors: [
        {
          id: 'arrow',
          label: 'Arrow',
          url: image.src,
          intrinsicSize: { width: 32, height: 32 },
          nominalSize: 32,
          hotspot: { x: 2, y: 2 },
        },
      ],
    },
    cursorSize: 24,
    cursorColor: '#fff',
    enableShadow: true,
    shadowBlur: 3,
    shadowColor: '#000',
    shadowDirection: 'bottom',
    clickEffects: presentation.clickEffects,
    motion: { ...presentation.motion, motionBlur: 0.7, model3d: mode === 'cursor-3d' },
    autoHide: presentation.autoHide,
    selectedBackground: null,
    zoomElements: [],
    selectedZoom: null,
    selectedTransformClip: null,
    activeTab: '',
    editorData: { cursor } as unknown as NonNullable<RuntimePreviewOptions['props']['editorData']>,
    zoomMotionBlur: { enabled: true, intensity: 0.6 },
  };
  if (mode === 'orbit-blur')
    props.zoomElements = [
      {
        id: 'zoom',
        sessionId: '',
        startMs: 0,
        endMs: 2000,
        mode: 'auto',
        depth: 2,
        focus: { cx: 0.4, cy: 0.5 },
        projection: 'orbit',
        transition: 'cinematic',
      },
    ];
  const drawBackground: RuntimePreviewOptions['drawBackground'] = (ctx, bounds) => {
    ctx.fillStyle = '#4a729c';
    ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
  };
  const preview = createRuntimePreview({
    props,
    images: new Map(),
    cursorImage: () => image,
    watermarkImage: () => null,
    cursorEnabled: () => true,
    drafts: () => ({}),
    editingCaptionId: () => null,
    backgroundCacheKey: () => [0],
    drawBackground,
  });
  try {
    const resolver = createCompositionSceneLayerResolver(composition);
    const actual = canvas(),
      reference = canvas(),
      background = canvas();
    drawBackground(background.context, { x: 0, y: 0, width: 320, height: 180 });
    let differences = 0,
      maxDelta = 0;
    const centers: unknown[] = [];
    for (const time of [0.2, 0.8, 1.4]) {
      props.currentTime = time;
      const prepared = preview.prepare({ x: 0, y: 0, width: 320, height: 180 }, frame, resolver(time * 1000));
      // Give both painters the same resource lifetime instead of borrowing the
      // other's quantized cursor rasters and projection surfaces.
      disposeCompositionRenderer();
      preview.paint(actual.context, prepared);
      centers.push({ time, prepared: prepared.evaluation.camera, repeated: prepared.evaluator.sample(time * 1000) });
      disposeCompositionRenderer();
      renderCompositionFrame(
        reference.context,
        { source: bitmap, width: 320, height: 180 },
        prepared.snapshot,
        time,
        { source: background.surface, width: 320, height: 180, preRendered: true },
        new Map([['arrow', image]]),
        new Map([['screen', { source: bitmap, width: 320, height: 180 }]]),
        prepared.motion,
        prepared.evaluator,
        { ...prepared.layers, sceneIndex: undefined },
      );
      const a = actual.context.getImageData(0, 0, 320, 180).data;
      const b = reference.context.getImageData(0, 0, 320, 180).data;
      for (let i = 0; i < a.length; i++)
        if (a[i] !== b[i]) {
          differences++;
          maxDelta = Math.max(maxDelta, Math.abs(a[i]! - b[i]!));
        }
    }
    return { differences, maxDelta, centers, comparedChannels: 320 * 180 * 4 * 3 };
  } finally {
    preview.dispose();
    frame.close();
  }
}

export async function decodeLongFinalFrame() {
  const surface = canvas(32, 32);
  surface.context.fillStyle = 'red';
  surface.context.fillRect(0, 0, 32, 32);
  const target = new BufferTarget();
  const output = new Output({ target, format: new WebMOutputFormat() });
  const source = new CanvasSource(surface.surface, { codec: 'vp8', bitrate: 200000 });
  output.addVideoTrack(source);
  await output.start();
  await source.add(0, 10);
  source.close();
  await output.finalize();
  const url = URL.createObjectURL(new Blob([target.buffer!], { type: 'video/webm' }));
  const asset = await loadPlaybackAsset({ assetId: 'single', kind: 'video', label: 'Single frame', url }, () => false);
  if (!asset) throw new Error('Fixture was not loaded');
  const consumer = createPlaybackConsumer(
    {
      clipId: 'screen',
      assetId: 'single',
      timelineStartSeconds: 0,
      timelineDurationSeconds: 10,
      sourceInSeconds: 0,
      playbackRate: 1,
    },
    asset,
    'full',
  );
  const canvases = consumer.sink.canvases.bind(consumer.sink);
  let openings = 0;
  consumer.sink.canvases = (...args) => {
    openings++;
    return canvases(...args);
  };
  const metrics = {
    decodedFrames: 0,
    presentedFrames: 0,
    droppedFrames: 0,
    supersededRequests: 0,
    queueSize: 0,
    cacheBytes: 0,
    disposedBitmaps: 0,
    seekLatencyMs: [],
  };
  const queue = createPlaybackFrameQueue(
    metrics,
    () => false,
    () => {},
    (message) => {
      throw new Error(message);
    },
  );
  let presented = 0;
  try {
    for (let i = 0; i < 240; i++) {
      const frame = await queue.sequentialFrame(consumer, i / 120);
      if (frame) {
        presented++;
        queue.closeFrame(frame);
      }
    }
    return { openings, decoded: metrics.decodedFrames, presented, ended: consumer.ended };
  } finally {
    await queue.resetConsumer(consumer);
    asset.opened.dispose();
    URL.revokeObjectURL(url);
  }
}

declare global {
  interface Window {
    playbackProbe: { compareFrame: typeof compareFrame; decodeLongFinalFrame: typeof decodeLongFinalFrame };
  }
}
window.playbackProbe = { compareFrame, decodeLongFinalFrame };
