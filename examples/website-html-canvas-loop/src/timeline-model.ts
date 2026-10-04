import { createDefaultClipAppearance } from '../../../packages/engine/src/shared/composition-defaults';
import { COMPOSITION_SCHEMA_VERSION } from '../../../packages/engine/src/shared/composition-types';
import type { ClipComposition } from '../../../packages/engine/src/shared/composition-types';
import sourceUrl from '../assets/html-source.mp4';
import { seekSeconds } from './scene-state';

/** The native editor uses a local render of this same HTML for its thumbnails. */
export function timelineDocument(): ClipComposition {
  return {
    schemaVersion: COMPOSITION_SCHEMA_VERSION,
    assets: [
      {
        id: 'html-render',
        kind: 'video',
        name: 'scene.html',
        fileName: 'html-source.mp4',
        durationMs: 12000,
        width: 500,
        height: 312,
        src: sourceUrl,
        origin: 'project',
      },
    ],
    clips: [
      {
        id: 'html-source',
        kind: 'video',
        name: 'scene.html',
        assetId: 'html-render',
        timelineStartMs: 0,
        timelineDurationMs: 12000,
        sourceInMs: 0,
        sourceDurationMs: 12000,
        playbackRate: 1,
        enabled: true,
        order: 0,
        transform: { x: 0, y: 0, width: 1, height: 1 },
        appearance: createDefaultClipAppearance('video'),
        isMirrored: false,
        isMirroredY: false,
      },
    ],
    keyboardCaptionSessions: [],
  };
}
export function playheadAt(clock: number) {
  const time = seekSeconds(clock * 1000);
  return time < 10.7 ? time : Math.max(0, (10.7 * (11.8 - time)) / 1.1);
}
