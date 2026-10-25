import { createRenderDocument } from '@beam/engine/document/render-document';
import { cursorComposition, screenClip } from '@beam/engine/capture/screen-cursor.test-support';
import { createDefaultCursorPresentation } from '@beam/engine/capture/cursor-presentation';
import { setScreenCursorSettings } from '@beam/engine/capture/screen-cursor-settings';
import { setScreenCursorVisibility } from '@beam/engine/capture/screen-cursor';
import type { CursorPackDescriptor } from '@beam/engine/capture/cursor-pack';
import type { VisualClip } from '@beam/engine/shared/composition-types';
import { prepareExportCursorImages } from '@beam/encoder/mediabunny/export-cursor-images';
import { renderCompositionFrame } from '@beam/runtime/rendering/render';
import { snapshotWithScreenCursor } from '@beam/runtime/rendering/snapshot-cursor';

/** Exercise real SVG decoding, export resources and completed-frame painting across a recording cut. */
export async function recordingCursorPixels(preview = false, hideFirst = false) {
  const pack: CursorPackDescriptor = {
    id: 'test:square',
    name: 'Pixel fixture',
    source: 'imported',
    colorMode: 'tintable',
    defaultCursorId: 'square',
    automaticMap: { default: 'square' },
    cursors: [
      {
        id: 'square',
        label: 'Square',
        format: 'svg',
        nominalSize: 32,
        intrinsicSize: { width: 32, height: 32 },
        hotspot: { x: 0, y: 0 },
        url: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" fill="#000000"/></svg>')}`,
      },
    ],
  };
  const defaults = createDefaultCursorPresentation();
  defaults.selection = { packId: pack.id, mode: 'fixed', cursorId: 'square' };
  defaults.shadow.enabled = false;
  defaults.motion = { ...defaults.motion, smoothing: 0, motionBlur: 0, stopSpringEnabled: false };
  defaults.clickEffects.left.springEnabled = defaults.clickEffects.right.springEnabled = false;
  const { enabled: _, ...style } = defaults;
  let composition = cursorComposition([
    screenClip('first', { timelineDurationMs: 1000, sourceDurationMs: 1000 }),
    screenClip('second', { timelineStartMs: 1000, timelineDurationMs: 1000, sourceDurationMs: 1000, sourceInMs: 1000 }),
  ]);
  composition = setScreenCursorSettings(composition, ['first'], { ...style, size: 40, color: '#ff0000' });
  composition = setScreenCursorSettings(composition, ['second'], { ...style, size: 80, color: '#0000ff' });
  if (hideFirst) composition = setScreenCursorVisibility(composition, ['first'], false);
  const snapshot = createRenderDocument(composition, 800, 400);
  snapshot.cursorSettings = defaults;
  snapshot.cursorPack = pack;
  snapshot.cursorPacks = [pack];
  snapshot.cursor = {
    ...snapshot.cursor,
    available: true,
    events: [
      { event: 'move', sessionNs: 0, pixelX: 480, pixelY: 540, normalizedX: 0.25, normalizedY: 0.5, visible: true },
    ],
  };
  const images = await prepareExportCursorImages({
    projectName: 'Fixture',
    format: 'webm',
    preset: 'medium',
    snapshot,
  });
  try {
    const scale = preview ? 0.5 : 1;
    const canvas = document.createElement('canvas');
    canvas.width = 800 * scale;
    canvas.height = 400 * scale;
    const context = canvas.getContext('2d')!;
    const source = new OffscreenCanvas(800, 400);
    const sourceContext = source.getContext('2d')!;
    sourceContext.fillStyle = '#888888';
    sourceContext.fillRect(0, 0, 800, 400);
    return [0.1, 1.1, 0.1].map((time) => {
      const screen = composition.clips[time < 1 ? 0 : 1]! as VisualClip;
      const frame = preview
        ? snapshotWithScreenCursor(
            { ...snapshot, canvas: { ...snapshot.canvas, width: canvas.width, height: canvas.height } },
            screen,
            scale,
          )
        : snapshot;
      context.clearRect(0, 0, canvas.width, canvas.height);
      renderCompositionFrame(
        context,
        { source, width: 800, height: 400 },
        frame,
        time,
        null,
        new Map(images.map((image) => [image.id, image.bitmap])),
      );
      const pixel = (x: number, y: number) =>
        Array.from(context.getImageData(Math.round(x * scale), Math.round(y * scale), 1, 1).data);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const colored = pixels.findIndex(
        (value, index) =>
          index % 4 === 0 && ((value > 240 && pixels[index + 2]! < 20) || (value < 20 && pixels[index + 2]! > 240)),
      );
      return {
        color: pixel(205, 205),
        extent: pixel(250, 205),
        firstColored:
          colored < 0 ? null : [Math.floor(colored / 4) % canvas.width, Math.floor(colored / 4 / canvas.width)],
      };
    });
  } finally {
    for (const image of images) image.bitmap.close();
  }
}
