import { computed, ref } from 'vue';
import type { Clip, MediaAsset } from '~/media/shared/composition-types';
import type { ZoomElement } from '../../zoom/zoom-types';
import type { TimelineClipboardEntry, TimelineClipboardItem } from './timeline-clipboard-types';
import { describeClipboardClip, describeClipboardZoom } from './timeline-clipboard-label';

export type { TimelineClipboardItem, TimelineItemCategory } from './timeline-clipboard-types';

const clipboardItem = ref<TimelineClipboardItem | null>(null);

export function getClipCategory(clip: Clip): 'visual' | 'audio' | 'caption' {
  if (clip.kind === 'audio') return 'audio';
  if (clip.kind === 'caption') return 'caption';
  return 'visual';
}

export function useTimelineClipboard() {
  const hasClipboardItem = computed(() => clipboardItem.value !== null);
  const clipboardCategory = computed(() => {
    const item = clipboardItem.value;
    return item && item.type !== 'selection' ? item.category : null;
  });

  const copyClip = (scopeId: string, clip: Clip, asset?: MediaAsset | null) => {
    const category = getClipCategory(clip);
    const item: TimelineClipboardItem = {
      type: 'clip',
      scopeId,
      category,
      clip: JSON.parse(JSON.stringify(clip)) as Clip,
      asset: asset ? (JSON.parse(JSON.stringify(asset)) as MediaAsset) : null,
      descriptor: describeClipboardClip(clip, asset ?? null),
    };
    clipboardItem.value = item;
    return item;
  };

  const copyZoom = (scopeId: string, zoom: ZoomElement, zoomElements: ZoomElement[]) => {
    const item: TimelineClipboardItem = {
      type: 'zoom',
      scopeId,
      category: 'zoom',
      zoom: JSON.parse(JSON.stringify(zoom)) as ZoomElement,
      descriptor: describeClipboardZoom(zoom, zoomElements),
    };
    clipboardItem.value = item;
    return item;
  };

  const copySelection = (options: {
    scopeId: string;
    clips: Clip[];
    zooms: ZoomElement[];
    allZooms: ZoomElement[];
    primaryId: string | null;
    assetFor: (clip: Clip) => MediaAsset | null;
  }) => {
    const entries: TimelineClipboardEntry[] = [
      ...options.clips.map((clip) => {
        const asset = options.assetFor(clip);
        return {
          type: 'clip' as const,
          category: getClipCategory(clip),
          clip: JSON.parse(JSON.stringify(clip)) as Clip,
          asset: asset ? (JSON.parse(JSON.stringify(asset)) as MediaAsset) : null,
          descriptor: describeClipboardClip(clip, asset),
        };
      }),
      ...options.zooms.map((zoom) => ({
        type: 'zoom' as const,
        category: 'zoom' as const,
        zoom: JSON.parse(JSON.stringify(zoom)) as ZoomElement,
        descriptor: describeClipboardZoom(zoom, options.allZooms),
      })),
    ];
    if (!entries.length) return null;
    if (entries.length === 1) {
      const item = { ...entries[0]!, scopeId: options.scopeId } as TimelineClipboardItem;
      clipboardItem.value = item;
      return item;
    }
    const primaryIndex = Math.max(
      0,
      entries.findIndex((entry) => (entry.type === 'clip' ? entry.clip.id : entry.zoom.id) === options.primaryId),
    );
    const item: TimelineClipboardItem = {
      type: 'selection',
      scopeId: options.scopeId,
      entries,
      anchorTimeMs: Math.min(
        ...entries.map((entry) => (entry.type === 'clip' ? entry.clip.timelineStartMs : entry.zoom.startMs)),
      ),
      primaryIndex,
      descriptor: { kind: 'selection', items: entries.map((entry) => entry.descriptor) },
    };
    clipboardItem.value = item;
    return item;
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
    copySelection,
    canPaste,
    getClipboardItem,
    clearClipboard,
  };
}
