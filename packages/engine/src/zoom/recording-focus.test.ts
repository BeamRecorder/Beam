import { describe, expect, it } from 'vitest';
import { recordingFocus } from './recording-focus';
import { colorClip } from '../scene/tests/scene-fixtures';
import type { VisualClip } from '../shared/composition-types';
import { createDefaultClipAppearance } from '../shared/composition-defaults';
import { frameMediaRect } from '../shared/frame-layout';

const clip: VisualClip = {
  ...colorClip('screen'),
  kind: 'screen',
  assetId: 'source',
  transform: { x: 0, y: 0, width: 1, height: 1 },
  isMirrored: false,
  isMirroredY: false,
  appearance: createDefaultClipAppearance('screen'),
};
const canvas = { width: 1920, height: 1080, showBackground: false };
describe('recording lens focus', () => {
  it('maps each local mirror before rotating around the rendered frame', () => {
    expect(
      recordingFocus({ ...clip, isMirrored: true, isMirroredY: true }, { cx: 0.25, cy: 0.75 }, 1920, 1080, canvas),
    ).toEqual({ cx: 0.75, cy: 0.25 });
    const rotated = recordingFocus({ ...clip, rotation: 90 }, { cx: 0.75, cy: 0.5 }, 1920, 1080, canvas)!;
    expect(rotated.cx).toBeCloseTo(0.5);
    expect(rotated.cy).toBeCloseTo(0.5 + 480 / 1080);
  });
  it('uses actual desktop and phone frame content instead of chrome or letterbox space', () => {
    for (const frame of ['safari', 'windows-95', 'iphone-16-max', 'pixel-9-pro'] as const) {
      const appearance = { ...clip.appearance!, frame };
      const expected = frameMediaRect({ x: 0, y: 0, width: 1920, height: 1080 }, frame, 1920, 1080, {
        showMenu: appearance.frameShowMenu,
        showScrollbars: appearance.frameShowScrollbars,
        chromeScale: appearance.frameChromeScale,
      });
      expect(recordingFocus({ ...clip, appearance }, { cx: 0.25, cy: 0.75 }, 1920, 1080, canvas)).toEqual({
        cx: (expected.x + 0.25 * expected.width) / 1920,
        cy: (expected.y + 0.75 * expected.height) / 1080,
      });
    }
  });
  it('rejects invalid coordinates and cropped-out clicks before mirroring', () => {
    const cropped = { ...clip, crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } };
    expect(recordingFocus(cropped, { cx: 0.1, cy: 0.5 }, 1920, 1080, canvas)).toBeNull();
    expect(recordingFocus(cropped, { cx: 0.5, cy: 0.9 }, 1920, 1080, canvas)).toBeNull();
    expect(recordingFocus(clip, { cx: NaN, cy: 0.5 }, 1920, 1080, canvas)).toBeNull();
    expect(recordingFocus(cropped, { cx: 0.5, cy: 0.5 }, 1920, 1080, canvas)).toEqual({ cx: 0.5, cy: 0.5 });
  });
});
