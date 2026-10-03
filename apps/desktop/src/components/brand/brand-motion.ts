import type { BrandJingle, BrandLetterFrame } from './brand-types';

export const BRAND_JINGLES: readonly BrandJingle[] = [
  'decode',
  'pixel',
  'glitch',
  'scan',
  'crash',
  'burst',
  'echo',
  'matrix',
  'spark',
  'shuffle',
  'type',
  'shimmer',
];
export const BRAND_JINGLE_SECONDS = 2.4;
const WORDMARK = [...'Beam'];
export const RESTING_WORDMARK = WORDMARK.map((text) => ({
  text,
  opacity: 1,
  blur: 0,
  contrast: 1,
  shadowX: 0,
  reveal: 1,
}));
const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};
const GLYPHS = ['░▒▓█', '░▒▓█', '+-=#', '─━═_', '/\\|_', '✦✧*+', '··:+', '01<>', '*+✦✧', 'Beam', 'Beam', 'Beam'];

/** Fixed letter slots, one sampled model, and continuous style parameters. */
export function sampleBrandJingle(jingle: BrandJingle, seconds: number): BrandLetterFrame[] {
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds >= BRAND_JINGLE_SECONDS) return RESTING_WORDMARK;
  const progress = seconds / BRAND_JINGLE_SECONDS;
  const index = BRAND_JINGLES.indexOf(jingle);
  const amount = smooth(progress / 0.18) * (1 - smooth((progress - 0.78) / 0.22));
  return WORDMARK.map((text, letter) => {
    const decode = smooth((progress - 0.45 - letter * 0.045) / 0.3);
    const strength = amount * (1 - decode);
    const alphabet = GLYPHS[index]!;
    const fragment = (Math.floor(seconds * (8 + index)) + index + letter * 2) % alphabet.length;
    return {
      text: strength > 0.45 && index < 10 ? alphabet[fragment]! : text,
      opacity: 1 - strength * (0.12 + (index % 3) * 0.08),
      blur: index === 6 || index === 11 ? strength * 0.7 : 0,
      contrast: 1 + strength * (0.1 + index * 0.03),
      shadowX: index === 2 || index === 4 || index === 6 ? Math.sin(seconds * 12) * strength : 0,
      reveal: index === 3 || index === 8 || index === 10 ? 1 - strength * 0.7 : 1,
    };
  });
}

export function blendBrandLetters(
  from: BrandLetterFrame[],
  to: BrandLetterFrame[],
  progress: number,
): BrandLetterFrame[] {
  const mix = smooth(progress);
  return from.map((letter, index) => {
    const target = to[index]!;
    return {
      text: mix < 0.5 ? letter.text : target.text,
      opacity: letter.opacity + (target.opacity - letter.opacity) * mix,
      blur: letter.blur + (target.blur - letter.blur) * mix,
      contrast: letter.contrast + (target.contrast - letter.contrast) * mix,
      shadowX: letter.shadowX + (target.shadowX - letter.shadowX) * mix,
      reveal: letter.reveal + (target.reveal - letter.reveal) * mix,
    };
  });
}

export function chooseBrandJingle(previous: BrandJingle | null, random = Math.random): BrandJingle {
  const choices = BRAND_JINGLES.filter((jingle) => jingle !== previous);
  return choices[Math.floor(random() * choices.length)]!;
}
