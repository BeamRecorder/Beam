import { describe, expect, it } from 'vitest';
import { TRANSITION_CATEGORIES } from '../transition-presets';
import { normalizeClipTransitions, resolveTransitionState } from '../clip-transitions';
import type { TransitionPreset } from '../composition-types';
import type { GpuTransitionPreset } from '../transition-types';
import type { TransitionCard } from '../transition-catalog-types';

const plainKinds = [
  'fade-black',
  'fade-white',
  'cross-zoom',
  'zoom-bounce',
  'split',
  'push-panels',
  'sliding-panels',
  'circle-reveal',
  'diamond-wipe',
  'linear-wipe',
  'gradient-wipe',
  'whip-pan',
  'push',
  'camera-shake',
  'rgb-split',
  'digital-glitch',
  'pixel-blocks',
] as const;
const colorKinds = ['dip-color', 'color-fade', 'color-flash'] as const;
const gpuPresets: GpuTransitionPreset[] = [
  ...plainKinds.map((kind) => ({ kind })),
  ...colorKinds.map((kind) => ({ kind, color: '#A1b2C3' })),
];
const normalize = (preset: TransitionPreset, kind: 'video' | 'audio' = 'video') =>
  normalizeClipTransitions({ entry: { preset, durationMs: 250 }, exit: null }, 1000, kind);

describe('categorized transition catalogue', () => {
  it('provides the seven ordered categories and unique, localized preset identities', () => {
    expect(TRANSITION_CATEGORIES.map((category) => category.id)).toEqual([
      'basics',
      'zooms',
      'panels',
      'shapes',
      'color',
      'dynamic',
      'digital',
    ]);
    const cards = TRANSITION_CATEGORIES.flatMap<TransitionCard>((category) => category.presets);
    expect(new Set(cards.map((card) => card.id)).size).toBe(cards.length);
    expect(cards).toHaveLength(28);
    for (const category of TRANSITION_CATEGORIES) {
      expect(category.labelKey).toBeTypeOf('string');
      expect(category.labelKey.length).toBeGreaterThan(0);
      expect(category.presets.length).toBeGreaterThan(0);
      for (const card of category.presets) {
        expect(card.labelKey).toBeTypeOf('string');
        expect(card.labelKey.length).toBeGreaterThan(0);
        expect(normalize(card.preset).entry?.preset).toEqual(card.preset);
      }
    }
  });

  it('retains all legacy directions and blur while grouping crossfade and zooms under their existing presets', () => {
    const category = (id: string) =>
      TRANSITION_CATEGORIES.find((category) => category.id === id)!.presets.map((card) => card.preset);
    expect(category('basics')).toContainEqual({ kind: 'fade' });
    expect(category('zooms')).toEqual(
      expect.arrayContaining([
        { kind: 'zoom', direction: 'in' },
        { kind: 'zoom', direction: 'out' },
      ]),
    );
    expect(category('dynamic')).toEqual(
      expect.arrayContaining([
        ...(['left', 'right', 'up', 'down'] as const).map((direction) => ({ kind: 'slide', direction })),
        { kind: 'blur' },
      ]),
    );
    const entries = TRANSITION_CATEGORIES.flatMap((category) => category.presets.map((card) => card.preset.kind));
    expect(entries).toEqual(expect.arrayContaining([...plainKinds, ...colorKinds]));
  });

  it.each(gpuPresets)('normalizes $kind without mutating its authored parameters', (preset) => {
    const before = JSON.stringify(preset);
    const result = normalize(preset);
    expect(result).toEqual({ entry: { preset, durationMs: 250 }, exit: null });
    expect(result.entry?.preset).not.toBe(preset);
    expect(JSON.stringify(preset)).toBe(before);
  });

  it.each(gpuPresets)('keeps $kind out of the audio-only transition domain', (preset) => {
    expect(normalize(preset, 'audio')).toEqual({ entry: null, exit: null });
  });

  it.each(colorKinds)('requires an explicit six-digit hex color for %s', (kind) => {
    for (const color of [undefined, null, '', '#fff', '#ffffffff', 'red', 'rgb(1,2,3)', '#GG0000', 42]) {
      expect(normalize({ kind, color } as unknown as TransitionPreset).entry, `${kind}: ${String(color)}`).toBeNull();
    }
    for (const color of ['#000000', '#ffffff', '#A1b2C3']) {
      expect(normalize({ kind, color }).entry?.preset).toEqual({ kind, color });
    }
  });

  it('fits GPU durations to short clips without losing presets or inventing audio gain', () => {
    const transitions = {
      entry: { preset: { kind: 'cross-zoom' } as GpuTransitionPreset, durationMs: 900, easingPower: 5 },
      exit: { preset: { kind: 'pixel-blocks' } as GpuTransitionPreset, durationMs: 900, easingPower: 1 },
    };
    const fitted = normalizeClipTransitions(transitions, 5, 'video');
    expect(fitted.entry).toEqual({ ...transitions.entry, durationMs: 2 });
    expect(fitted.exit).toEqual({ ...transitions.exit, durationMs: 3 });
    expect(resolveTransitionState(fitted, 0, 5).effect?.preset).toEqual(transitions.entry.preset);
    expect(normalizeClipTransitions(transitions, 0, 'video')).toEqual({ entry: null, exit: null });
    expect(normalizeClipTransitions({ entry: null, exit: null }, 10, 'video')).toEqual({ entry: null, exit: null });
  });

  it('does not accept unknown or malformed transition families', () => {
    for (const preset of [
      { kind: 'unknown' },
      { kind: 'slide', direction: 'diagonal' },
      { kind: 'zoom', direction: 'forward' },
    ]) {
      expect(normalize(preset as unknown as TransitionPreset)).toEqual({ entry: null, exit: null });
    }
  });
});
