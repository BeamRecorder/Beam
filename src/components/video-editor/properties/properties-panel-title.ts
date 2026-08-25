import type { ClipKind } from '~/media/shared/composition-types';

type Translate = (key: string) => string;

export function propertiesPanelTitle(
  activeTab: string,
  clipKind: ClipKind | null,
  translations: {
    t: Translate;
    tSidebar: Translate;
    tTimeline: Translate;
    tTimelineToolbar: Translate;
    tCanvas: Translate;
  },
): string {
  if (activeTab === 'clip') {
    if (!clipKind) return translations.tSidebar('clip');
    if (clipKind === 'screen' || clipKind === 'video') return translations.tTimeline('video');
    if (clipKind === 'image') return translations.tTimelineToolbar('image');
    if (clipKind === 'webcam') return translations.tTimeline('webcam');
    if (clipKind === 'color') return translations.tCanvas('color');
    if (clipKind === 'shape') return translations.tCanvas('shapesAndArrows');
    if (clipKind === 'blur') return translations.tTimeline('blur');
    if (clipKind === 'caption') return translations.tSidebar('captions');
    return translations.tSidebar('audio');
  }

  const sidebarKey =
    activeTab === 'caption'
      ? 'captions'
      : ['canvas', 'zoom', 'cursor', 'audio', 'settings'].includes(activeTab)
        ? activeTab
        : null;
  return sidebarKey ? translations.tSidebar(sidebarKey) : translations.t('properties');
}

export function clipTransitionPanelTitle(kind: ClipKind | undefined, tClipTransitions: () => string): string {
  if (kind === 'color' || kind === 'shape') return tClipTransitions();
  if (kind === 'caption') return 'Caption Transitions';
  if (kind === 'audio') return 'Audio Transitions';
  if (kind === 'blur') return 'Blur Transitions';
  if (kind === 'image') return 'Image Transitions';
  if (kind === 'webcam') return 'Webcam Transitions';
  return 'Video Transitions';
}
