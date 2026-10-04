import { describe, expect, it } from 'vitest';
import { htmlSceneFixture } from './tests/html-scene-fixture';
import { createHtmlSceneResolver } from './html-scene';

const htmlDomPreviewAt = (
  composition: ReturnType<typeof htmlSceneFixture>['composition'],
  time: number,
  canvas: ReturnType<typeof htmlSceneFixture>['canvas'],
  camera: boolean,
) => createHtmlSceneResolver(composition)(time, canvas, camera);

describe('direct HTML scene eligibility', () => {
  it('retains the same source and timeline resolver throughout playback and reverse seeks', () => {
    const f = htmlSceneFixture(),
      at = createHtmlSceneResolver(f.composition);
    const first = at(1000, f.canvas, false);
    for (const time of [1001, 2000, 14000, 3000, 1000]) expect(at(time, f.canvas, false)).toBe(first);
    expect(at(0, f.canvas, false)).toBeNull();
    expect(at(1000, f.canvas, false)).toBe(first);
    const revised = {
      ...f.composition,
      clips: f.composition.clips.map((clip) => ({ ...clip, timelineStartMs: 5000 })),
    };
    const next = createHtmlSceneResolver(revised);
    expect(next(1000, f.canvas, false)).toBeNull();
    expect(next(5000, f.canvas, false)?.clip.timelineStartMs).toBe(5000);
  });
  it('presents a single complete HTML scene only during its active interval', () => {
    const f = htmlSceneFixture();
    expect(htmlDomPreviewAt(f.composition, 1000, f.canvas, false)?.html).toBe(f.html);
    expect(htmlDomPreviewAt(f.composition, 0, f.canvas, false)).toBeNull();
    expect(htmlDomPreviewAt(f.composition, 16000, f.canvas, false)).toBeNull();
    f.clip.crop = { x: 0, y: 0, width: 1, height: 1 };
    f.clip.appearance.cornerRadius = 'none';
    expect(htmlDomPreviewAt(f.composition, 2000, f.canvas, false)).not.toBeNull();
  });
  it('keeps camera effects, watermark and mismatched aspect ratios in the compositor', () => {
    const f = htmlSceneFixture();
    expect(htmlDomPreviewAt(f.composition, 2000, f.canvas, true)).toBeNull();
    expect(
      htmlDomPreviewAt(
        f.composition,
        2000,
        { ...f.canvas, watermark: { ...f.canvas.watermark!, enabled: true } },
        false,
      ),
    ).toBeNull();
    expect(htmlDomPreviewAt(f.composition, 2000, { ...f.canvas, width: 1080 }, false)).toBeNull();
  });
  it.each(['x', 'y', 'width', 'height'] as const)('rejects partial-canvas geometry: %s', (key) => {
    const f = htmlSceneFixture();
    f.clip.transform[key] = 0.5;
    expect(htmlDomPreviewAt(f.composition, 2000, f.canvas, false)).toBeNull();
  });
  it.each(['x', 'y', 'width', 'height'] as const)('rejects a source crop: %s', (key) => {
    const f = htmlSceneFixture();
    f.clip.crop = { x: 0, y: 0, width: 1, height: 1 };
    f.clip.crop[key] = 0.5;
    expect(htmlDomPreviewAt(f.composition, 2000, f.canvas, false)).toBeNull();
  });
  it.each([{ cornerRadius: 12 }, { shadowSize: 'md' as const }, { borderEnabled: true }, { frame: 'macos' as const }])(
    'retains Beam framing in the compositor (%j)',
    (appearance) => {
      const f = htmlSceneFixture();
      Object.assign(f.clip.appearance, appearance);
      expect(htmlDomPreviewAt(f.composition, 2000, f.canvas, false)).toBeNull();
    },
  );
  it('retains rotations, mirrors, transitions and multiple layers in the compositor', () => {
    for (const patch of [
      { rotation: 2 },
      { isMirrored: true },
      { isMirroredY: true },
      { transitions: { entry: { preset: { kind: 'fade' }, durationMs: 100 }, exit: null } },
    ]) {
      const f = htmlSceneFixture();
      Object.assign(f.clip, patch);
      expect(htmlDomPreviewAt(f.composition, 2000, f.canvas, false)).toBeNull();
    }
    const f = htmlSceneFixture();
    f.composition.clips.push({ ...f.clip, id: 'another', order: 1 });
    expect(htmlDomPreviewAt(f.composition, 2000, f.canvas, false)).toBeNull();
  });
  it('retains document animations, captions and output transitions in the compositor', () => {
    const f = htmlSceneFixture();
    const transition = { preset: { kind: 'fade' as const }, durationMs: 100 };
    expect(
      htmlDomPreviewAt(f.composition, 2000, { ...f.canvas, transitions: { entry: transition, exit: null } }, false),
    ).toBeNull();
    expect(
      htmlDomPreviewAt(f.composition, 2000, { ...f.canvas, transitions: { entry: null, exit: transition } }, false),
    ).toBeNull();
    f.composition.animations = {
      version: 1,
      tracks: [{ id: 'animation', targetId: f.clip.id, property: 'opacity', interpolation: 'number', keyframes: [] }],
    };
    expect(htmlDomPreviewAt(f.composition, 2000, f.canvas, false)).toBeNull();
  });
  it('rejects missing and static HTML sources', () => {
    const f = htmlSceneFixture();
    f.html.durationMs = 0;
    expect(htmlDomPreviewAt(f.composition, 2000, f.canvas, false)).toBeNull();
    Reflect.deleteProperty(f.asset, 'html');
    expect(htmlDomPreviewAt(f.composition, 2000, f.canvas, false)).toBeNull();
    f.composition.assets = [];
    expect(htmlDomPreviewAt(f.composition, 2000, f.canvas, false)).toBeNull();
  });
});
