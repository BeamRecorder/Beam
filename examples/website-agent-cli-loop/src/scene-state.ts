import type { CommandCue, CommandState } from './scene-types';
export function seekSeconds(timeMs: number): number {
  if (!Number.isFinite(timeMs)) throw new RangeError('Seek time must be finite');
  return Math.max(0, Math.min(7, timeMs / 1000));
}
// Adapted from HyperFrames code-terminal-run: a character frontier and
// integer-phase caret, derived entirely from the seek clock.
export function commandState(cue: CommandCue, clock: number): CommandState {
  const time = clock >= 6.75 ? 0 : clock;
  const progress = Math.max(0, Math.min(1, (time - cue.start) / (cue.end - cue.start)));
  const complete = progress === 1;
  return {
    typed: cue.command.slice(0, Math.floor(progress * cue.command.length)),
    caret: time >= cue.start && !complete && Math.floor((time - cue.start) * 5) % 2 === 0,
    complete,
    visible: time >= cue.start,
  };
}
