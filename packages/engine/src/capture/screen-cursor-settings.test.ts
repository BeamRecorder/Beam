import { describe, expect, it } from 'vitest';
import { createDefaultCursorPresentation } from './cursor-presentation';
import { screenCursorPresentation, setScreenCursorSettings, cursorImageKey } from './screen-cursor-settings';
import { validateScreenCursorSettings } from './screen-cursor-schema';
import { trackPropertyComposition } from '../composition/clip-track-properties.test-support';
import { splitClip } from '../commands/clip-engine';
import { freezeDocument } from '../document/immutable-document';
import type { VisualClip } from '../shared/composition-types';

export const screenStyle = () => {
  const { enabled: _, ...style } = createDefaultCursorPresentation();
  return style;
};
describe('per-recording cursor presentation', () => {
  it('inherits historical project settings and keeps per-clip visibility authoritative', () => {
    const doc = trackPropertyComposition(),
      defaults = createDefaultCursorPresentation();
    expect(screenCursorPresentation(doc.clips[0], defaults)).toEqual(defaults);
    expect(screenCursorPresentation({ ...doc.clips[0]!, showCursor: false } as VisualClip, defaults).enabled).toBe(
      false,
    );
    expect(screenCursorPresentation(undefined, defaults).enabled).toBe(false);
  });
  it('owns cursor settings without changing other clips or freezing the project defaults', () => {
    const before = trackPropertyComposition(),
      style = screenStyle();
    style.size = 90;
    style.color = '#ff0000';
    const after = setScreenCursorSettings(before, ['first'], style);
    freezeDocument(after);
    style.shadow.blur = 20;
    expect((after.clips[0] as VisualClip).cursorSettings?.shadow.blur).toBe(6);
    expect((after.clips[1] as VisualClip).cursorSettings).toBeUndefined();
    expect((before.clips[0] as VisualClip).cursorSettings).toBeUndefined();
    expect(screenCursorPresentation(after.clips[0], createDefaultCursorPresentation())).toMatchObject({
      size: 90,
      color: '#ff0000',
    });
  });
  it('retains the style at cuts, then lets either fragment change independently', () => {
    const styled = setScreenCursorSettings(trackPropertyComposition(), ['first'], screenStyle());
    const split = splitClip(styled, 'first', 1000);
    const right = split.clips.find((clip) => clip.timelineStartMs === 1000)!;
    const next = setScreenCursorSettings(split, [right.id], { ...screenStyle(), size: 100 });
    expect((next.clips.find((clip) => clip.id === 'first') as VisualClip).cursorSettings?.size).toBe(45);
    expect((next.clips.find((clip) => clip.id === right.id) as VisualClip).cursorSettings?.size).toBe(100);
  });
  it('does not create edits for missing IDs or the same settings', () => {
    const doc = trackPropertyComposition(),
      style = screenStyle();
    expect(setScreenCursorSettings(doc, [], style)).toBe(doc);
    expect(setScreenCursorSettings(doc, ['missing'], style)).toBe(doc);
    const next = setScreenCursorSettings(doc, ['first'], style);
    expect(setScreenCursorSettings(next, ['first'], style)).toBe(next);
  });
  it('blocks locked selections atomically', () => {
    const doc = trackPropertyComposition();
    doc.clips[1]!.locked = true;
    expect(() => setScreenCursorSettings(doc, ['first', 'second'], screenStyle())).toThrow('locked');
    expect((doc.clips[0] as VisualClip).cursorSettings).toBeUndefined();
  });
  it.each([
    ['size', 0],
    ['size', 385],
    ['size', NaN],
    ['color', ''],
    ['enabled', true],
  ])('rejects invalid %s values', (key, value) => {
    const doc = trackPropertyComposition();
    expect(() => setScreenCursorSettings(doc, ['first'], { ...screenStyle(), [key]: value })).toThrow();
  });
  it('accepts valid fixed artwork and complete motion/effect settings', () => {
    const style = screenStyle();
    style.selection = { packId: 'imported', mode: 'fixed', cursorId: 'pointer' };
    style.motion.model3d = true;
    style.clickEffects.left.rippleEnabled = true;
    expect(() => validateScreenCursorSettings(style)).not.toThrow();
  });
  it.each([
    { selection: { packId: '', mode: 'automatic', cursorId: null } },
    { selection: { packId: 'x', mode: 'fixed', cursorId: null } },
    { shadow: { enabled: true, blur: 200, color: '#000', direction: 'bottom' } },
    { motion: { ...screenStyle().motion, preset: 'invalid' } },
    { motion: { ...screenStyle().motion, stopSpringEnabled: 1 } },
    { autoHide: { enabled: true, delaySeconds: 20, fadeDurationMs: 250 } },
    { autoHide: { enabled: true, delaySeconds: 2, fadeDurationMs: -1 } },
    { clickEffects: { left: {}, right: {} } },
  ])('rejects malformed nested cursor data %#', (patch) => {
    expect(() => validateScreenCursorSettings({ ...screenStyle(), ...patch })).toThrow();
  });
  it('keeps imported packs and color variants in separate resource namespaces', () => {
    expect(cursorImageKey('one', 'default', '#000')).not.toBe(cursorImageKey('two', 'default', '#000'));
    expect(cursorImageKey('one', 'default', '#000')).not.toBe(cursorImageKey('one', 'default', '#fff'));
    expect(cursorImageKey('one', 'default', '#000')).toBe(cursorImageKey('one', 'default', '#000'));
  });
});
