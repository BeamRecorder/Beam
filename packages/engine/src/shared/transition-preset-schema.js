export const TRANSITION_EFFECT_KINDS = Object.freeze([
  'fade-black',
  'fade-white',
  'dip-color',
  'cross-zoom',
  'zoom-bounce',
  'split',
  'push-panels',
  'sliding-panels',
  'circle-reveal',
  'diamond-wipe',
  'linear-wipe',
  'color-fade',
  'gradient-wipe',
  'color-flash',
  'whip-pan',
  'push',
  'camera-shake',
  'rgb-split',
  'digital-glitch',
  'pixel-blocks',
]);
const effects = new Set(TRANSITION_EFFECT_KINDS);
const colors = new Set(['dip-color', 'color-fade', 'color-flash']);

/** One portable contract for engine edits and native project storage. */
export function isTransitionPreset(preset, domain = 'visual') {
  if (!preset || typeof preset !== 'object' || Array.isArray(preset)) return false;
  if (domain === 'audio' && preset.kind !== 'fade') return false;
  if (preset.kind === 'slide')
    return (
      ['left', 'right', 'up', 'down'].includes(preset.direction) &&
      Object.keys(preset).every((key) => key === 'kind' || key === 'direction')
    );
  if (preset.kind === 'zoom')
    return (
      ['in', 'out'].includes(preset.direction) &&
      Object.keys(preset).every((key) => key === 'kind' || key === 'direction')
    );
  if (colors.has(preset.kind))
    return (
      typeof preset.color === 'string' &&
      /^#[\da-f]{6}$/i.test(preset.color) &&
      Object.keys(preset).every((key) => key === 'kind' || key === 'color')
    );
  return (
    (preset.kind === 'fade' || preset.kind === 'blur' || effects.has(preset.kind)) &&
    Object.keys(preset).every((key) => key === 'kind')
  );
}

export const isGpuTransitionPreset = (preset) => Boolean(preset && effects.has(preset.kind));
