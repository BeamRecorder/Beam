import { computed, ref, type Ref } from 'vue';
import { ClipboardPaste, Copy, Trash2 } from '@lucide/vue';
import type { Clip, ClipComposition, MediaAsset } from '~/media/shared/composition-types';
import type { ZoomElement } from '../../zoom/zoom-types';
import type { ContextMenuItemOrDivider } from '~/components/ui/context-menu';
import { getClipCategory, useTimelineClipboard } from './useTimelineClipboard';
import type { TimelineItemCategory, TimelinePasteTarget } from './timeline-clipboard-types';
import type { TimelineTracksEmits } from './timeline-tracks-types';

export interface TimelineContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  category: TimelineItemCategory;
  clip: Clip | null;
  zoom: ZoomElement | null;
  trackId?: string | null;
}

export function useTimelineContextMenu(options: {
  scopeId: Ref<string | null>;
  currentTimeMs: Ref<number>;
  composition: Ref<ClipComposition>;
  zoomElements: Ref<ZoomElement[]>;
  selectedClipId: Ref<string | null>;
  selectedZoomId: Ref<string | null>;
  assetFor: (clip: Clip) => MediaAsset | null;
  emit: TimelineTracksEmits;
  t: (key: string) => string;
}) {
  const clipboard = useTimelineClipboard();
  const contextMenuState = ref<TimelineContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    category: 'visual',
    clip: null,
    zoom: null,
    trackId: null,
  });

  const openClipContextMenu = (event: MouseEvent, clip: Clip) => {
    event.preventDefault();
    event.stopPropagation();
    options.emit('select:clip', clip.id);
    contextMenuState.value = {
      isOpen: true,
      x: event.clientX,
      y: event.clientY,
      category: getClipCategory(clip),
      clip,
      zoom: null,
      trackId: clip.trackId ?? null,
    };
  };

  const openZoomContextMenu = (event: MouseEvent, zoom: ZoomElement) => {
    event.preventDefault();
    event.stopPropagation();
    options.emit('select:zoom', zoom.id);
    contextMenuState.value = {
      isOpen: true,
      x: event.clientX,
      y: event.clientY,
      category: 'zoom',
      clip: null,
      zoom,
      trackId: null,
    };
  };

  const openTrackContextMenu = (event: MouseEvent, category: TimelineItemCategory, trackId?: string) => {
    event.preventDefault();
    contextMenuState.value = {
      isOpen: true,
      x: event.clientX,
      y: event.clientY,
      category,
      clip: null,
      zoom: null,
      trackId: trackId ?? null,
    };
  };

  const closeContextMenu = () => {
    contextMenuState.value.isOpen = false;
  };

  const selectedItem = () => {
    const zoom = options.selectedZoomId.value
      ? (options.zoomElements.value.find((item) => item.id === options.selectedZoomId.value) ?? null)
      : null;
    if (zoom) return { zoom, clip: null };
    const clip = options.selectedClipId.value
      ? (options.composition.value.clips.find((item) => item.id === options.selectedClipId.value) ?? null)
      : null;
    return { zoom: null, clip };
  };

  const copyItem = (clip: Clip | null, zoom: ZoomElement | null): boolean => {
    const scopeId = options.scopeId.value;
    if (!scopeId) return false;
    if (zoom) clipboard.copyZoom(scopeId, zoom);
    else if (clip) clipboard.copyClip(scopeId, clip, options.assetFor(clip));
    else return false;
    return true;
  };

  const copySelected = () => {
    const selected = selectedItem();
    if (!copyItem(selected.clip, selected.zoom)) options.emit('paste:error', options.t('copyUnavailable'));
  };

  const pasteClipboard = (target?: TimelinePasteTarget | null) => {
    const item = clipboard.getClipboardItem();
    if (!item) return options.emit('paste:error', options.t('clipboardEmpty'));
    options.emit('paste:item', { item, timeMs: options.currentTimeMs.value, target });
  };

  const contextMenuItems = computed<ContextMenuItemOrDivider[]>(() => {
    const { category, clip, zoom } = contextMenuState.value;
    const canCopy = Boolean(options.scopeId.value && (category === 'zoom' ? zoom : clip));
    const items: ContextMenuItemOrDivider[] = [
      { id: 'copy', label: options.t('copy'), icon: Copy, shortcut: 'Ctrl+C', disabled: !canCopy },
      {
        id: 'paste',
        label: options.t('paste'),
        icon: ClipboardPaste,
        shortcut: 'Ctrl+V',
        disabled: !clipboard.hasClipboardItem.value,
      },
      { isDivider: true },
      {
        id: 'delete',
        label: options.t('delete'),
        icon: Trash2,
        danger: true,
        shortcut: 'Del',
        disabled: category === 'zoom' ? !zoom : !clip,
      },
    ];
    return items;
  });

  const handleContextMenuSelect = (actionId: string) => {
    const { category, clip, zoom, trackId } = contextMenuState.value;
    if (actionId === 'copy') copyItem(clip, zoom);
    else if (actionId === 'paste') pasteClipboard({ category, trackId });
    else if (actionId === 'delete') {
      if (category === 'zoom' && zoom) options.emit('delete:zoom', zoom.id);
      else if (clip) options.emit('delete:clips', [clip.id]);
    }
    closeContextMenu();
  };

  return {
    contextMenuState,
    contextMenuItems,
    openClipContextMenu,
    openZoomContextMenu,
    openTrackContextMenu,
    closeContextMenu,
    handleContextMenuSelect,
    copySelected,
    pasteClipboard,
  };
}
