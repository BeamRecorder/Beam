import type { SessionTrackData } from './capture-session';

/** Use the recording cadence for both preview camera simulation and exported frames. */
export function recordingFrameRate(tracks: readonly Pick<SessionTrackData, 'kind' | 'format'>[] = []): number {
  const screen = tracks.find((track) => track.kind === 'screen');
  const value = screen?.format.frameRate ?? screen?.format.fps;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 30;
}
