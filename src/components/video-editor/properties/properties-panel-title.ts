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
  },
): string {
  if (activeTab === 'clip') {
    if (!clipKind) return translations.tSidebar('clip');
    if (clipKind === 'screen' || clipKind === 'video') return translations.tTimeline('video');
    if (clipKind === 'image') return translations.tTimelineToolbar('image');
    if (clipKind === 'webcam') return translations.tTimeline('webcam');
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
