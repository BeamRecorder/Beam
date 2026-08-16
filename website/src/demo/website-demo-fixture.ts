import type { CapturePreview, CaptureSource } from '~/api/types/capture-api';
import type { CaptionClip, ClipComposition } from '~/media/shared/composition-types';
import { createDefaultCaptionStyle } from '~/media/shared/composition-defaults';
import demoThumbnailUrl from '../../../docs/assets/Beam-showcase.png';
import beamIconUrl from '../../../public/brand/BeamIcon.webp';
import defaultCursorUrl from '../../../public/macOsSvgCursors/default.svg';
import { websiteI18n } from '@website/i18n';

const t = websiteI18n.global.t;

export const demoMedia = {
  thumbnailUrl: demoThumbnailUrl,
  iconUrl: beamIconUrl,
  defaultCursorUrl,
} as const;

export const demoCaptureSources: CaptureSource[] = [
  {
    id: 'beam-demo-display',
    kind: 'display',
    label: t('Website.hud.mainDisplay'),
    isDefault: true,
    displayId: '1',
    selectionMode: 'direct',
  },
  {
    id: 'beam-demo-window',
    kind: 'window',
    label: t('Website.hud.chooseWindow'),
    isDefault: false,
    selectionMode: 'portal',
  },
];

export const demoCapturePreviews: CapturePreview[] = [
  {
    id: 'beam-demo-display',
    name: t('Website.hud.demoName'),
    thumbnail: demoThumbnailUrl,
    appIcon: null,
    displayId: '1',
    displayBounds: { x: 0, y: 0, width: 1920, height: 1080 },
  },
];

export const addDemoCaption = (composition: ClipComposition, timeMs: number, durationMs: number): ClipComposition => {
  const startMs = Math.max(0, Math.min(Math.max(0, durationMs - 1_500), timeMs));
  const caption: CaptionClip = {
    id: `homepage-caption-${composition.clips.length}`,
    kind: 'caption',
    name: t('Website.editor.captionName'),
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
          text: t('Website.editor.captionText'),
          startMs,
          endMs: startMs + 1_500,
          words: [],
        },
      ],
      style: {
        ...createDefaultCaptionStyle(42),
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
