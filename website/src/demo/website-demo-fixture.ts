import type { CapturePreview, CaptureSource } from '~/api/types/capture-api';
import {
  COMPOSITION_SCHEMA_VERSION,
  type CaptionClip,
  type Clip,
  type ClipComposition,
} from '~/media/shared/composition-types';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import type { ZoomElement } from '~/components/video-editor/zoom/zoom-types';
import demoVideoUrl from '../../../docs/assets/BeamDemo.webm';
import demoThumbnailUrl from '../../../docs/assets/Beam-showcase.png';
import beamIconUrl from '../../../public/brand/BeamIcon.webp';

export const DEMO_DURATION_MS = 10_809;

export const demoMedia = {
  videoUrl: demoVideoUrl,
  thumbnailUrl: demoThumbnailUrl,
  iconUrl: beamIconUrl,
} as const;

export const demoCaptureSources: CaptureSource[] = [
  {
    id: 'beam-demo-display',
    kind: 'display',
    label: 'Main display',
    isDefault: true,
    displayId: '1',
    selectionMode: 'direct',
  },
  {
    id: 'beam-demo-window',
    kind: 'window',
    label: 'Choose a window',
    isDefault: false,
    selectionMode: 'portal',
  },
];

export const demoCapturePreviews: CapturePreview[] = [
  {
    id: 'beam-demo-display',
    name: 'Beam demo — 1920 × 1080',
    thumbnail: demoThumbnailUrl,
    appIcon: null,
    displayId: '1',
    displayBounds: { x: 0, y: 0, width: 1920, height: 1080 },
  },
];

export const createDemoComposition = (): ClipComposition => ({
  schemaVersion: COMPOSITION_SCHEMA_VERSION,
  assets: [
    {
      id: 'beam-demo-video',
      kind: 'video',
      name: 'BeamDemo.webm',
      fileName: 'BeamDemo.webm',
      durationMs: DEMO_DURATION_MS,
      width: 1920,
      height: 1080,
      src: demoVideoUrl,
      origin: 'project',
    },
  ],
  clips: [
    {
      id: 'beam-demo-screen',
      kind: 'screen',
      name: 'Beam demo',
      assetId: 'beam-demo-video',
      timelineStartMs: 0,
      timelineDurationMs: DEMO_DURATION_MS,
      sourceInMs: 0,
      sourceDurationMs: DEMO_DURATION_MS,
      playbackRate: 1,
      enabled: true,
      order: 0,
      transform: { x: 0, y: 0, width: 1, height: 1 },
      appearance: createDefaultClipAppearance('screen'),
      isMirrored: false,
      isMirroredY: false,
    },
  ],
  keyboardCaptionSessions: [],
});

export const createDemoZooms = (): ZoomElement[] => [
  {
    id: 'beam-demo-zoom',
    sessionId: 'homepage-demo',
    startMs: 2_200,
    endMs: 5_100,
    focus: { cx: 0.56, cy: 0.45 },
    depth: 2,
    mode: 'manual',
  },
];

export const updateClip = (
  composition: ClipComposition,
  clipId: string,
  updater: (clip: Clip) => Clip,
): ClipComposition => ({
  ...composition,
  clips: composition.clips.map((clip) => (clip.id === clipId ? updater(clip) : clip)),
});

export const addDemoCaption = (composition: ClipComposition, timeMs: number): ClipComposition => {
  const startMs = Math.max(0, Math.min(DEMO_DURATION_MS - 1_500, timeMs));
  const caption: CaptionClip = {
    id: `homepage-caption-${composition.clips.length}`,
    kind: 'caption',
    name: 'Product demo caption',
    timelineStartMs: startMs,
    timelineDurationMs: 1_500,
    sourceInMs: 0,
    sourceDurationMs: 1_500,
    playbackRate: 1,
    enabled: true,
    order: -1,
    caption: {
      type: 'text',
      sentences: [
        {
          id: 'homepage-caption-sentence',
          text: 'Record. Edit. Share.',
          startMs,
          endMs: startMs + 1_500,
          words: [],
        },
      ],
      style: {
        color: '#ffffff',
        fontSize: 48,
        wrap: true,
        shadowColor: '#000000',
        shadowBlur: 8,
        backdropBlur: 0,
        outlineColor: '#000000',
        outlineWidth: 0,
        extrusionDepth: 0,
        placement: 'bottom',
      },
    },
  };
  return { ...composition, clips: [...composition.clips, caption] };
};
