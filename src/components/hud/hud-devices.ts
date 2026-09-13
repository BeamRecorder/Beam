import type { CaptureSource } from '~/api/types/capture-api';
import type { SavedDevices } from './hud-state-types';

export function restoreHudDevices(saved: SavedDevices | null, sources: readonly CaptureSource[]) {
  const available = (id: string | undefined, disabled: string) =>
    id && (id === disabled || sources.some((source) => source.id === id)) ? id : disabled;
  return {
    cameraId: available(saved?.cameraId, 'off'),
    micId: available(saved?.micId, 'no-audio'),
    systemAudioMode: saved?.systemAudioMode === 'on' ? ('on' as const) : ('off' as const),
  };
}
