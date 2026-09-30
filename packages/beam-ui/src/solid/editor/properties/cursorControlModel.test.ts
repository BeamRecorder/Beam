import { expect, it } from 'vitest';
import { cursorControlStyle } from './cursorControlModel';
import type { CursorStyle } from '../shared/generated/editorContracts';

const click = { springEnabled: true, springIntensity: 50, rippleEnabled: false, rippleStyle: 'single' as const, rippleSize: 30, rippleColor: [1, 0.3, 0.1, 1] as [number, number, number, number] };
const style: CursorStyle = { enabled: true, shape: 'pointer', size: 45, color: [0,0,0,1], borderColor: [1,1,1,1], clicks: true, smoothingMs: 60, hideAfterMs: 0,
  selection: { packId: 'builtin:macos', mode: 'automatic', cursorId: null },
  shadow: { enabled: true, blur: 6, color: [0,0,0,1], direction: 'bottom' },
  motion: { preset: 'smooth', smoothing: 0.67, springMassMultiplier: 1.29, motionBlur: 0.4 },
  clickEffects: { left: click, right: click }, fadeDurationMs: 250 };
it('retains all values returned by the engine without inventing a profile', () => {
  expect(cursorControlStyle(style)).toEqual(style);
});
it('accepts a zero fade duration and a fixed selection', () => {
  const fixed = { ...style, fadeDurationMs: 0, selection: { packId: 'builtin:macos', mode: 'fixed' as const, cursorId: 'textcursor' } };
  expect(cursorControlStyle(fixed)).toEqual(fixed);
});
it('reports missing materialized settings explicitly', () => {
  for (const key of ['selection', 'shadow', 'motion', 'clickEffects', 'fadeDurationMs'] as const) {
    expect(() => cursorControlStyle({ ...style, [key]: undefined })).toThrow('incomplete cursor profile');
  }
});
