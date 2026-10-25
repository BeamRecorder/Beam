import { cursorComposition, screenClip } from '../capture/screen-cursor.test-support';
import type { ClipComposition } from '../shared/composition-types';
import { createComposition } from '../commands/clip-engine';

export function trackPropertyComposition(): ClipComposition {
  return cursorComposition([
    screenClip('first', { trackId: 'recording-track' }),
    screenClip('second', { trackId: 'recording-track', timelineStartMs: 2500 }),
    screenClip('third', { trackId: 'recording-track', timelineStartMs: 5000 }),
    screenClip('other', { trackId: 'other-track', order: 1 }),
  ]);
}

export function trackPropertyCameraComposition(): ClipComposition {
  const composition = trackPropertyComposition();
  const screens = composition.clips.filter((clip) => clip.id !== 'other');
  return createComposition(composition.assets, [
    ...screens.map((clip) => ({ ...clip, groupId: `pair-${clip.id}` })),
    ...screens.map((clip) =>
      screenClip(`camera-${clip.id}`, {
        kind: 'webcam',
        trackId: 'camera-track',
        order: 1,
        timelineStartMs: clip.timelineStartMs,
        groupId: `pair-${clip.id}`,
      }),
    ),
  ]);
}
