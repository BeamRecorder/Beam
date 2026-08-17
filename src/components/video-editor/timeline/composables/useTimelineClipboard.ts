import { computed, ref } from 'vue';
import type { Clip, MediaAsset } from '~/media/shared/composition-types';
import type { ZoomElement } from '../../zoom/zoom-types';
import type { TimelineClipboardItem } from './timeline-clipboard-types';

export type { TimelineClipboardItem, TimelineItemCategory } from './timeline-clipboard-types';

const clipboardItem = ref<TimelineClipboardItem | null>(null);

export function getClipCategory(clip: Clip): 'visual' | 'audio' | 'caption' {
  if (clip.kind === 'audio') return 'audio';
  if (clip.kind === 'caption') return 'caption';
  return 'visual';
}

export function useTimelineClipboard() {
  const hasClipboardItem = computed(() => clipboardItem.value !== null);
  const clipboardCategory = computed(() => clipboardItem.value?.category ?? null);

  const copyClip = (scopeId: string, clip: Clip, asset?: MediaAsset | null) => {
    const category = getClipCategory(clip);
    clipboardItem.value = {
      type: 'clip',
      scopeId,
      category,
      clip: JSON.parse(JSON.stringify(clip)) as Clip,
      asset: asset ? (JSON.parse(JSON.stringify(asset)) as MediaAsset) : null,
    };
  };

  const copyZoom = (scopeId: string, zoom: ZoomElement) => {
    clipboardItem.value = {
      type: 'zoom',
      scopeId,
      category: 'zoom',
      zoom: JSON.parse(JSON.stringify(zoom)) as ZoomElement,
    };
  };

  const canPaste = (scopeId: string | null | undefined): boolean =>
    Boolean(scopeId && clipboardItem.value?.scopeId === scopeId);

  const getClipboardItem = () =>
    clipboardItem.value ? (JSON.parse(JSON.stringify(clipboardItem.value)) as TimelineClipboardItem) : null;

  const clearClipboard = () => {
    clipboardItem.value = null;
  };

  return {
    clipboardItem,
    hasClipboardItem,
    clipboardCategory,
    copyClip,
    copyZoom,
    canPaste,
    getClipboardItem,
    clearClipboard,
  };
}
