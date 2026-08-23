export type HeroCursorKind = 'pointer' | 'hand' | 'grabbing';

export interface HeroDragFrame {
  cursorKind: HeroCursorKind | null;
  cursorX: number;
  cursorY: number;
  cursorOpacity: number;
  playerTranslateY: number;
  playerScale: number;
}

export const HERO_DRAG_DURATION_MS = 4_200;

export const HERO_CURSOR_HOTSPOTS: Record<HeroCursorKind, { x: number; y: number }> = {
  pointer: { x: 10, y: 7 },
  hand: { x: 16, y: 16 },
  grabbing: { x: 16, y: 16 },
};

export const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const lerp = (from: number, to: number, t: number): number => from + (to - from) * t;
const easeInOut = (t: number): number => t * t * (3 - 2 * t);
const easeOutBack = (t: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};
const segment = (p: number, start: number, end: number): number => clamp01((p - start) / (end - start));

const cursorKindAt = (p: number): HeroCursorKind | null => {
  if (p < 0.4) return 'pointer';
  if (p < 0.48) return 'hand';
  if (p < 0.94) return 'grabbing';
  return null;
};

/**
 * One-shot entrance choreography played on load: the macOS cursor enters from
 * the copy side, hovers over the player (hand), grabs it and drags it down,
 * then releases — the player springs back and keeps playing.
 */
export function heroDragFrame(rawProgress: number): HeroDragFrame {
  const p = clamp01(rawProgress);

  const cursorIn = easeInOut(segment(p, 0, 0.12));
  const cursorMove = easeInOut(segment(p, 0.12, 0.4));
  const drag = easeInOut(segment(p, 0.56, 0.86));
  const cursorOut = easeInOut(segment(p, 0.9, 0.94));
  const springBack = easeOutBack(segment(p, 0.9, 1));

  const cursorOpacity = cursorIn * (1 - cursorOut);
  const cursorKind = cursorKindAt(p);

  return {
    cursorKind: cursorKind && cursorOpacity > 0.01 ? cursorKind : null,
    cursorX: lerp(-6, 50, cursorMove),
    cursorY: lerp(46, 50, cursorMove) + 34 * drag * (1 - springBack),
    cursorOpacity,
    playerTranslateY: 34 * drag * (1 - springBack),
    playerScale: 1 - 0.26 * drag * (1 - springBack),
  };
}
