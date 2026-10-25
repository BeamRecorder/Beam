import { createComposition } from '../commands/clip-engine';
import { createDefaultClipAppearance } from '../shared/composition-defaults';
import type { ClipComposition, VisualClip } from '../shared/composition-types';

export const screenClip = (id = 'screen', patch: Partial<VisualClip> = {}): VisualClip => ({
  id,
  kind: 'screen',
  name: id,
  assetId: 'recording',
  trackId: `${id}-track`,
  timelineStartMs: 0,
  timelineDurationMs: 2000,
  sourceInMs: 0,
  sourceDurationMs: 2000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance('screen'),
  isMirrored: false,
  isMirroredY: false,
  ...patch,
});

export const cursorComposition = (clips: VisualClip[] = [screenClip()]): ClipComposition =>
  createComposition(
    [
      {
        id: 'recording',
        kind: 'video',
        name: 'Screen recording',
        fileName: null,
        durationMs: 2000,
        width: 1920,
        height: 1080,
        src: '/recording.mp4',
        origin: 'session',
        sessionId: 'session',
        sessionPath: 'screen/recording.mp4',
      },
    ],
    clips,
  );
