import type { ClipComposition, VisualClip } from '../../shared/composition-types';
import type { RecordlySourceSample } from './recordly-camera-types';

/** Choose the actual visible screen before applying upstream timeline/source rounding. */
export function createRecordlySourceClock(
  composition: ClipComposition,
  screenAt: (timeMs: number) => VisualClip | null,
) {
  const assets = new Map(composition.assets.map((asset) => [asset.id, asset]));
  return (timeMs: number): RecordlySourceSample | null => {
    const screen = screenAt(timeMs);
    if (!screen) return null;
    const asset = assets.get(screen.assetId);
    if (!asset) return null;
    const source =
      screen.freezeFrameSourceMs ??
      screen.sourceInMs + (Math.round(timeMs) - screen.timelineStartMs) * screen.playbackRate;
    return { clipId: screen.id, timeMs: Math.round((asset.sessionStartMs ?? 0) + source) };
  };
}
