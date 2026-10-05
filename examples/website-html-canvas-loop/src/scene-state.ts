import type { SceneState } from './scene-types';

export const DURATION = 12;
export const TITLE = 'Make it yours.';
export function seekSeconds(timeMs: number) {
  if (!Number.isFinite(timeMs)) throw new TypeError('Scene time must be finite');
  return Math.max(0, Math.min(DURATION, timeMs / 1000));
}
export function sceneState(clock: number): SceneState {
  const t = seekSeconds(clock * 1000);
  const saved = t >= 3.15 && t < 11.2;
  const edited = t >= 1.4 && t < 11.2;
  const characters = Math.max(0, Math.min(TITLE.length, Math.floor((t - 1.4) / 0.075)));
  const accent = t >= 4.8 && t < 11.2 ? '#cf4a1d' : '#d7d2c7';
  return {
    typed: edited ? TITLE.slice(0, characters) : 'Hello, HTML.',
    title: saved ? TITLE : 'Hello, HTML.',
    saved,
    accent,
    caret: t >= 1.4 && t < 2.7 && Math.floor(t * 4) % 2 === 0,
    phase:
      t < 3.15 || t >= 11.2
        ? 'Edit the source'
        : t < 8.6
          ? 'See your canvas update'
          : 'Keep the source. Render locally.',
  };
}
