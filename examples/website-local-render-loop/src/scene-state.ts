import type { RenderState } from './scene-types';
export const durationSeconds = 8;
export const renderCommand = 'beam-cli motion scene.json output.mp4';
export function seekSeconds(timeMs: number): number {
  if (!Number.isFinite(timeMs)) throw new RangeError('Seek time must be finite');
  return Math.max(0, Math.min(durationSeconds, timeMs / 1000));
}
// Illustrated phases, not measured export speed. All state follows the seek clock.
// Character frontier/caret adapted from HyperFrames code-terminal-run.
export function renderState(clock: number): RenderState {
  if (!Number.isFinite(clock)) throw new RangeError('Clock must be finite');
  const time = clock >= 7.8 ? 0 : Math.max(0, clock);
  const typing = Math.max(0, Math.min(1, (time - 0.5) / 1.4));
  const progress = time >= 5.6 ? 1 : Math.max(0, (time - 2.1) / 3.5);
  return {
    typed: renderCommand.slice(0, Math.floor(typing * renderCommand.length)),
    caret: time >= 0.5 && time < 1.9 && Math.floor((time - 0.5) * 5) % 2 === 0,
    progress,
    percentage: Math.floor(progress * 100),
    phase: time < 2.1 ? 'idle' : time < 5.6 ? 'rendering' : time < 6 ? 'finalizing' : 'saved',
    frame: Math.floor(progress * 6),
  };
}
