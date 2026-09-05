import { describe, expect, it, vi } from 'vitest';
import type { RenderableMedia } from '../render';
import { renderCompositionFrame } from '../render';
import type { VisualClip } from '~/media/shared/composition-types';
import * as decoratedMedia from '../../../video-editor/composition/appearance/render-decorated-media';
import { context, screenAppearance, snapshot } from './render.test-support';

const source = (width = 100, height = 50): RenderableMedia => ({
  source: {} as CanvasImageSource,
  width,
  height,
});

const bottomCrop = { x: 0, y: 0.75, width: 1, height: 0.25 } as const;

const drawCall = (value: ReturnType<typeof snapshot>, media = source()) => {
  const ctx = context();
  const drawSpy = vi.spyOn(decoratedMedia, 'drawDecoratedMedia');
  renderCompositionFrame(ctx, media, value, 0);
  const options = drawSpy.mock.calls.at(-1)?.[1];
  drawSpy.mockRestore();
  return options;
};

describe('composition crop rendering', () => {
  it('keeps a bottom screen crop at its original destination scale', () => {
    const value = snapshot();
    const screen = value.composition.clips[0];
    if (screen.kind !== 'screen') throw new Error('screen fixture missing');

    const uncropped = drawCall(value);
    screen.crop = bottomCrop;
    const cropped = drawCall(value);

    expect(uncropped).toMatchObject({
      sourceRect: { x: 0, y: 0, width: 100, height: 50 },
      rect: { x: 0, y: 0, width: 100, height: 50 },
    });
    expect(cropped).toMatchObject({
      sourceRect: { x: 0, y: 37.5, width: 100, height: 12.5 },
      rect: { x: 0, y: 37.5, width: 100, height: 12.5 },
    });
  });

  it.each([false, true] as const)('keeps the original screen media bounds with background=%s', (showBackground) => {
    const value = snapshot();
    value.canvas = { ...value.canvas, showBackground };
    const screen = value.composition.clips[0];
    if (screen.kind !== 'screen') throw new Error('screen fixture missing');
    screen.crop = bottomCrop;

    const cropped = drawCall(value);
    const destination = showBackground
      ? { x: 7, y: 35.75, width: 86, height: 10.75 }
      : { x: 0, y: 37.5, width: 100, height: 12.5 };

    expect(cropped).toMatchObject({
      sourceRect: { x: 0, y: 37.5, width: 100, height: 12.5 },
      rect: destination,
    });
  });

  it('mirrors the destination crop while preserving source coordinates', () => {
    const value = snapshot();
    const screen = value.composition.clips[0];
    if (screen.kind !== 'screen') throw new Error('screen fixture missing');
    screen.crop = { x: 0.1, y: 0.25, width: 0.5, height: 0.25 };
    screen.isMirrored = true;
    screen.isMirroredY = true;

    const cropped = drawCall(value);

    expect(cropped).toMatchObject({
      sourceRect: { x: 10, y: 12.5, width: 50, height: 12.5 },
      rect: { x: 40, y: 25, width: 50, height: 12.5 },
      mirrored: true,
      mirroredY: true,
    });
  });

  it('keeps an imported visual crop in place on the output canvas', () => {
    const value = snapshot();
    const image: VisualClip = {
      id: 'image',
      kind: 'image',
      name: 'Image',
      assetId: 'image-asset',
      timelineStartMs: 0,
      timelineDurationMs: 1_000,
      sourceInMs: 0,
      sourceDurationMs: 1_000,
      playbackRate: 1,
      enabled: true,
      order: 0,
      transform: { x: 0, y: 0, width: 1, height: 1 },
      crop: bottomCrop,
      appearance: screenAppearance,
      isMirrored: false,
      isMirroredY: false,
    };
    value.composition = {
      ...value.composition,
      assets: [
        {
          id: 'image-asset',
          kind: 'image',
          name: 'Image',
          fileName: 'image.png',
          durationMs: 1_000,
          width: 100,
          height: 50,
          src: 'file:///image.png',
          origin: 'project',
        },
      ],
      clips: [image],
    };
    const visual = source();
    const ctx = context();
    const drawSpy = vi.spyOn(decoratedMedia, 'drawDecoratedMedia');

    renderCompositionFrame(ctx, null, value, 0, null, undefined, new Map([['image', visual]]));

    const cropped = drawSpy.mock.calls.at(-1)?.[1];
    drawSpy.mockRestore();
    expect(cropped).toMatchObject({
      sourceRect: { x: 0, y: 37.5, width: 100, height: 12.5 },
      rect: { x: 0, y: 37.5, width: 100, height: 12.5 },
    });
  });
});
