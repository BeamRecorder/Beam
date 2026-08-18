import { describe, expect, it } from 'vitest';
import { cursorAssetAt, cursorCanvasBounds, cursorGeometryAtSize, cursorPositionAt } from '../cursor-rendering';
import { frameContentRect } from '../../../composition/appearance/frames';
import type { CursorPackDescriptor, CursorSelection } from '~/api/types/cursor-pack';
import type { CursorPlaybackState } from '../../../composables/cursorPlayback';

const state = (x: number, y: number, cursorKind: string | null = 'default'): CursorPlaybackState => ({
  x,
  y,
  visible: true,
  cursorId: null,
  shapeId: null,
  cursorKind: cursorKind as CursorPlaybackState['cursorKind'],
  hotspot: { x: 0, y: 0 },
});

const renderingPack: CursorPackDescriptor = {
  id: 'pack:rendering',
  name: 'Rendering pack',
  source: 'imported',
  colorMode: 'tintable',
  defaultCursorId: 'fallback',
  cursors: [
    {
      id: 'fallback',
      label: 'Fallback',
      url: 'project-media://cursor/pack:rendering/fallback',
      intrinsicSize: { width: 32, height: 32 },
      nominalSize: 32,
      hotspot: { x: 7, y: 5 },
    },
    {
      id: 'text',
      label: 'Text',
      url: 'project-media://cursor/pack:rendering/text',
      intrinsicSize: { width: 20, height: 10 },
      nominalSize: 40,
      hotspot: { x: 6, y: 8 },
    },
    {
      id: 'fixed',
      label: 'Fixed',
      url: 'project-media://cursor/pack:rendering/fixed',
      intrinsicSize: { width: 32, height: 32 },
      nominalSize: 32,
      hotspot: { x: 16, y: 16 },
    },
  ],
  automaticMap: { textcursor: 'text' },
};

const automatic: CursorSelection = { packId: renderingPack.id, mode: 'automatic', cursorId: null };

describe('cursor rendering', () => {
  it('projects a non-square cursor bounds through the camera and click spring scale', () => {
    const asset = renderingPack.cursors.find((cursor) => cursor.id === 'text')!;
    const geometry = cursorGeometryAtSize(asset, 40);
    const result = cursorCanvasBounds(
      { x: 110, y: 90 },
      geometry,
      { dx: 10, dy: 20, dw: 200, dh: 100, focusX: 110, focusY: 70, scale: 2 },
      1.5,
    );

    // The hotspot is camera-scaled, while the rendered asset is scaled by both camera and spring.
    expect(result).toEqual({
      x: 92,
      y: 86,
      width: 60,
      height: 30,
      hotspot: { x: 110, y: 110 },
    });
  });

  it('maps automatic roles, honours valid fixed selections and falls back to the pack default', () => {
    expect(cursorAssetAt(renderingPack, automatic, state(0.5, 0.5, 'textcursor')).id).toBe('text');
    expect(
      cursorAssetAt(renderingPack, { ...automatic, mode: 'fixed', cursorId: 'fixed' }, state(0.5, 0.5, 'textcursor'))
        .id,
    ).toBe('fixed');
    expect(cursorAssetAt(renderingPack, automatic, state(0.5, 0.5, 'unknown')).id).toBe('fallback');
  });

  it('scales width, height and hotspot independently from the nominal cursor size', () => {
    const textAsset = renderingPack.cursors.find((asset) => asset.id === 'text')!;
    expect(cursorGeometryAtSize(textAsset, 80)).toEqual({
      width: 40,
      height: 20,
      hotspot: { x: 12, y: 16 },
    });
  });

  it('uses the same framed-background and base-transform coordinates for every canvas', () => {
    expect(
      cursorPositionAt(state(0.5, 0.5), { width: 100, height: 50 }, { x: 10, y: 20, width: 200, height: 200 }, true, {
        x: 0.1,
        y: 0.2,
        width: 0.8,
        height: 0.6,
      }),
    ).toEqual({ x: 110, y: 120 });
  });

  it('anchors the cursor to Safari content below the toolbar', () => {
    const rect = { x: 10, y: 20, width: 400, height: 200 };
    const content = frameContentRect(rect, 'safari');
    expect(
      cursorPositionAt(state(0.5, 0.5), { width: 400, height: 200 }, rect, false, undefined, false, false, {
        frame: 'safari',
        frameShowMenu: true,
        frameShowScrollbars: true,
        frameChromeScale: 1,
      }),
    ).toEqual({
      x: content.x + content.width / 2,
      y: content.y + content.height / 2,
    });
  });

  it('includes Windows 95 chrome options and scale in cursor placement', () => {
    const rect = { x: 0, y: 0, width: 400, height: 260 };
    const appearance = {
      frame: 'windows-95' as const,
      frameShowMenu: true,
      frameShowScrollbars: false,
      frameChromeScale: 1.5,
    };
    const content = frameContentRect(rect, 'windows-95', {
      showMenu: appearance.frameShowMenu,
      showScrollbars: appearance.frameShowScrollbars,
      chromeScale: appearance.frameChromeScale,
    });
    const position = cursorPositionAt(
      state(0.25, 0.75),
      { width: 400, height: 260 },
      rect,
      false,
      undefined,
      false,
      false,
      appearance,
    );
    expect(position).toEqual({
      x: content.x + content.width * 0.25,
      y: content.y + content.height * 0.75,
    });
    expect(position.y).toBeGreaterThan(0.75 * rect.height);
  });

  it('maps cropped source coordinates into the decorated content', () => {
    const rect = { x: 0, y: 0, width: 400, height: 200 };
    const content = frameContentRect(rect, 'safari');
    expect(
      cursorPositionAt(
        state(0.5, 0.5),
        { width: 800, height: 400 },
        rect,
        false,
        undefined,
        false,
        false,
        {
          frame: 'safari',
          frameShowMenu: true,
          frameShowScrollbars: true,
          frameChromeScale: 1,
        },
        { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
      ),
    ).toEqual({
      x: content.x + content.width / 2,
      y: content.y + content.height / 2,
    });
  });

  it('mirrors and clamps cursor coordinates at the shared geometry boundary', () => {
    expect(
      cursorPositionAt(
        state(2, -0.1),
        { width: 100, height: 100 },
        { x: 0, y: 0, width: 100, height: 100 },
        false,
        undefined,
        true,
      ),
    ).toEqual({ x: 0, y: 0 });
  });
});
