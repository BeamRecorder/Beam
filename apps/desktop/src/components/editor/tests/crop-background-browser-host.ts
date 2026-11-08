import {
  BufferSource,
  BufferTarget,
  CanvasSource,
  Input,
  MP4,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  VideoSampleSink,
} from 'mediabunny';
import { createCompositionSnapshot } from '@beam/runtime/rendering/snapshot';
import { createRenderDocument } from '@beam/engine/document/render-document';
import { createDefaultClipAppearance } from '@beam/engine/shared/composition-defaults';
import { createRuntimePreview } from '../canvas/runtime-preview';
import { resolveCompositionSceneLayers } from '@beam/engine/composition/scene-layers';
import { openExportAssets } from '@beam/encoder/mediabunny/export-worker-assets';
import { loadExportImages } from '@beam/encoder/mediabunny/export-images';
import { renderExportVideo } from '@beam/encoder/mediabunny/export-worker-pipelines';
import type { BackgroundValue } from '@beam/engine/shared/background-types';
import type { VisualClip } from '@beam/engine/shared/composition-types';
import type { ExportRequest } from '@beam/encoder/export-types';

async function encode(canvas: OffscreenCanvas) {
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat(), target });
  const video = new CanvasSource(canvas, {
    codec: 'avc',
    quality: QUALITY_HIGH,
    hardwareAcceleration: 'prefer-software',
  });
  output.addVideoTrack(video, { frameRate: 1 });
  await output.start();
  await video.add(0, 1);
  video.close();
  await output.finalize();
  return target.buffer!;
}

export async function checkCropBackground(kind: 'color' | 'image', showBackground = true) {
  const width = 1920,
    height = 1080;
  const source = new OffscreenCanvas(width, height),
    paint = source.getContext('2d')!;
  paint.fillStyle = '#3366cc';
  paint.fillRect(0, 0, width, height);
  paint.fillStyle = '#ff0033';
  paint.fillRect(0, height - 40, width, 40);
  const upload = await fetch('/crop-source.mp4', { method: 'POST', body: await encode(source) });
  if (!upload.ok) throw new Error('Could not publish the test recording');
  const document = createRenderDocument(undefined, width, height, 1);
  document.duration = 1;
  const asset = {
    id: 'recording',
    kind: 'video' as const,
    name: 'Recording',
    fileName: 'recording.mp4',
    durationMs: 1000,
    width,
    height,
    src: new URL('/crop-source.mp4', location.href).href,
    origin: 'session' as const,
  };
  const clip: VisualClip = {
    id: 'screen',
    kind: 'screen',
    name: 'Recording',
    assetId: asset.id,
    timelineStartMs: 0,
    timelineDurationMs: 1000,
    sourceInMs: 0,
    sourceDurationMs: 1000,
    playbackRate: 1,
    enabled: true,
    order: 0,
    transform: { x: 0, y: 0, width: 1, height: 1 },
    crop: { x: 0, y: 0, width: 1, height: 1040 / 1080 },
    isMirrored: false,
    isMirroredY: false,
    appearance: { ...createDefaultClipAppearance('screen'), cornerRadius: 'none', shadowSize: 'none' },
  };
  document.composition = { ...document.composition, assets: [asset], clips: [clip] };
  const wallpaper = new OffscreenCanvas(64, 64),
    wallpaperPaint = wallpaper.getContext('2d')!;
  wallpaperPaint.fillStyle = '#e3d5ff';
  wallpaperPaint.fillRect(0, 0, 64, 64);
  const blob = await wallpaper.convertToBlob({ type: 'image/png' });
  const path = URL.createObjectURL(blob);
  const background: BackgroundValue =
    kind === 'color'
      ? { id: 'purple', name: 'Purple', kind: 'color', color: '#e3d5ff' }
      : { id: 'wallpaper', name: 'Wallpaper', kind: 'image', path, extension: 'png' };
  const snapshot = createCompositionSnapshot({
    duration: 1,
    fps: 1,
    canvas: { ...document.canvas, preset: '16:9', showBackground },
    background,
    blurPercent: 0,
    editorData: null,
    zooms: [],
    composition: document.composition,
    cursorSettings: document.cursorSettings,
    cursorPack: null,
  });
  const request: ExportRequest = {
    projectName: '40 px crop',
    format: 'mp4',
    preset: 'high',
    includeAudio: false,
    snapshot,
  };
  const signal = new AbortController().signal;
  const assets = await openExportAssets(request, signal, () => {});
  const images = new Map<string, ImageBitmap>();
  const exportImages = await loadExportImages(request, images);
  const track = assets.assets.get(asset.id)!.video!;
  const sample = (await new VideoSampleSink(track).getSample(0))!;
  const bitmap = await createImageBitmap(sample.toCanvasImageSource());
  const frame = {
    bitmap,
    width,
    height,
    timestampSeconds: 0,
    durationSeconds: 1,
    clipId: clip.id,
    byteSize: width * height * 4,
    close: () => bitmap.close(),
  };
  const cursor = snapshot.cursorSettings;
  const preview = createRuntimePreview({
    props: {
      isPlaying: false,
      currentTime: 0,
      duration: 1,
      composition: document.composition,
      outputCanvas: snapshot.canvas,
      frameFor: () => frame,
      frameVersion: 1,
      previewQuality: 'full',
      playbackState: 'paused',
      playbackError: null,
      cursorSelection: cursor.selection,
      cursorPack: null,
      cursorSize: cursor.size,
      cursorColor: cursor.color,
      enableShadow: cursor.shadow.enabled,
      shadowBlur: cursor.shadow.blur,
      shadowColor: cursor.shadow.color,
      shadowDirection: cursor.shadow.direction,
      clickEffects: cursor.clickEffects,
      motion: cursor.motion,
      autoHide: cursor.autoHide,
      zoomElements: [],
      selectedZoom: null,
      selectedBackground: background,
      activeTab: '',
      selectedTransformClip: null,
      editorData: null,
    },
    images: new Map(),
    cursorImage: () => null,
    cursorEnabled: () => false,
    watermarkImage: () => null,
    drafts: () => ({}),
    editingCaptionId: () => null,
    backgroundCacheKey: () => [background],
    drawBackground(context, bounds) {
      if (kind === 'image') context.drawImage(wallpaper, bounds.x, bounds.y, bounds.width, bounds.height);
      else {
        context.fillStyle = '#e3d5ff';
        context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
      }
    },
  });
  const previewCanvas = window.document.createElement('canvas');
  previewCanvas.width = width;
  previewCanvas.height = height;
  const previewContext = previewCanvas.getContext('2d')!;
  const layers = resolveCompositionSceneLayers(document.composition, 0);
  preview.paint(previewContext, preview.prepare({ x: 0, y: 0, width, height }, frame, layers));
  const canvas = new OffscreenCanvas(width, height),
    context = canvas.getContext('2d')!;
  const target = new BufferTarget(),
    output = new Output({ format: new Mp4OutputFormat(), target });
  const video = new CanvasSource(canvas, {
    codec: 'avc',
    quality: QUALITY_HIGH,
    hardwareAcceleration: 'prefer-software',
  });
  output.addVideoTrack(video, { frameRate: 1 });
  await output.start();
  const pixel = (ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D, y: number) =>
    Array.from(ctx.getImageData(width / 2, y, 1, 1).data);
  try {
    await renderExportVideo(
      request,
      assets,
      exportImages,
      new Map(),
      context,
      { addVideo: (timestamp, duration) => video.add(timestamp, duration), closeVideo: () => video.close() },
      signal,
      () => {},
    );
    await output.finalize();
    const decoded = new Input({ source: new BufferSource(target.buffer!), formats: [MP4] });
    const exportedTrack = (await decoded.getPrimaryVideoTrack())!;
    const exportedFrame = (await new VideoSampleSink(exportedTrack).getSample(0))!;
    const decodedCanvas = new OffscreenCanvas(width, height),
      decodedContext = decodedCanvas.getContext('2d')!;
    decodedContext.drawImage(exportedFrame.toCanvasImageSource(), 0, 0);
    const gapY = showBackground ? 980 : 1060;
    const contentY = showBackground ? 940 : 1020;
    const result = {
      bytes: target.buffer!.byteLength,
      dimensions: [await exportedTrack.getDisplayWidth(), await exportedTrack.getDisplayHeight()],
      previewGap: pixel(previewContext, gapY),
      exportGap: pixel(context, gapY),
      encodedGap: pixel(decodedContext, gapY),
      previewContent: pixel(previewContext, contentY),
      exportContent: pixel(context, contentY),
      encodedContent: pixel(decodedContext, contentY),
    };
    exportedFrame.close();
    decoded.dispose();
    return result;
  } finally {
    if (output.state === 'started') await output.cancel();
    preview.dispose();
    bitmap.close();
    sample.close();
    assets.dispose();
    for (const image of images.values()) image.close();
    URL.revokeObjectURL(path);
  }
}
