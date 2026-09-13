import { computed, ref, type Ref } from 'vue';
import { AudioLines, ClipboardPaste, Copy, Lock, Unlock, Pause, Trash2 } from '@lucide/vue';
import { isAudioClip, type Clip, type ClipComposition, type MediaAsset } from '~/media/shared/composition-types';
import type { ZoomElement } from '../../zoom/zoom-types';
import type { ContextMenuItemOrDivider } from '~/components/ui/context-menu';
import { getClipCategory, useTimelineClipboard } from './useTimelineClipboard';
import type { TimelineClipboardItem, TimelineItemCategory, TimelinePasteTarget } from './timeline-clipboard-types';
import type { TimelineTracksEmits } from './timeline-tracks-types';
import { MIN_CLIP_DURATION_MS } from '../../composition/engine/clip-engine';
import { selectionHasLocks } from '../../composition/timeline-locks';
import { rippleRangeForSelection } from '../../composition/timeline-edit-operations';

export interface TimelineContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  category: TimelineItemCategory;
  clip: Clip | null;
  zoom: ZoomElement | null;
  clipIds: string[];
  zoomIds: string[];
  trackId?: string | null;
}

export function useTimelineContextMenu(options: {
  scopeId: Ref<string | null>;
  currentTimeMs: Ref<number>;
  composition: Ref<ClipComposition>;
  zoomElements: Ref<ZoomElement[]>;
  selectedClipId: Ref<string | null>;
  selectedClipIds: Ref<string[]>;
  selectedZoomId: Ref<string | null>;
  selectedZoomIds: Ref<string[]>;
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
    clipIds: [],
    zoomIds: [],
    trackId: null,
  });
  const selectedZoomIds = () =>
    options.selectedZoomIds.value.length
      ? options.selectedZoomIds.value
      : options.selectedZoomId.value
        ? [options.selectedZoomId.value]
        : [];

  const openClipContextMenu = (event: MouseEvent, clip: Clip) => {
    event.preventDefault();
    event.stopPropagation();
    const isSelected = options.selectedClipIds.value.includes(clip.id);
    if (!isSelected) options.emit('select:item', { kind: 'clip', id: clip.id, intent: 'replace' });
    contextMenuState.value = {
      isOpen: true,
      x: event.clientX,
      y: event.clientY,
      category: getClipCategory(clip),
      clip,
      zoom: null,
      clipIds: isSelected ? [...options.selectedClipIds.value] : [clip.id],
      zoomIds: isSelected ? [...options.selectedZoomIds.value] : [],
      trackId: clip.trackId ?? null,
    };
  };

  const openZoomContextMenu = (event: MouseEvent, zoom: ZoomElement) => {
    event.preventDefault();
    event.stopPropagation();
    const effectiveZoomIds = selectedZoomIds();
    const isSelected = effectiveZoomIds.includes(zoom.id);
    if (!isSelected) options.emit('select:item', { kind: 'zoom', id: zoom.id, intent: 'replace' });
    contextMenuState.value = {
      isOpen: true,
      x: event.clientX,
      y: event.clientY,
      category: 'zoom',
      clip: null,
      zoom,
      clipIds: isSelected ? [...options.selectedClipIds.value] : [],
      zoomIds: isSelected ? [...effectiveZoomIds] : [zoom.id],
      trackId: null,
    };
  };

  const openTrackContextMenu = (
    event: MouseEvent,
    category: TimelineItemCategory,
    trackId?: string,
    laneClipIds?: string[],
  ) => {
    event.preventDefault();
    const selected = selectedItem();
    if (laneClipIds || trackId) {
      selected.clipIds =
        laneClipIds ??
        options.composition.value.clips
          .filter((clip) => clip.trackId === trackId || (!clip.trackId && clip.id === trackId))
          .map((clip) => clip.id);
      selected.zoomIds = [];
      selected.clip = options.composition.value.clips.find((clip) => selected.clipIds.includes(clip.id)) ?? null;
      selected.zoom = null;
    }
    if (category === 'zoom' && laneClipIds) {
      selected.clipIds = [];
      selected.zoomIds = options.zoomElements.value.map((zoom) => zoom.id);
      selected.clip = null;
      selected.zoom = options.zoomElements.value[0] ?? null;
    }
    contextMenuState.value = {
      isOpen: true,
      x: event.clientX,
      y: event.clientY,
      category,
      clip: selected.clip,
      zoom: selected.zoom,
      clipIds: selected.clipIds,
      zoomIds: selected.zoomIds,
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
    if (zoom)
      return {
        zoom,
        clip: null,
        clipIds: [...options.selectedClipIds.value],
        zoomIds: [...selectedZoomIds()],
      };
    const clipsById = new Map(options.composition.value.clips.map((clip) => [clip.id, clip]));
    const requestedIds = options.selectedClipIds.value.length
      ? options.selectedClipIds.value
      : options.selectedClipId.value
        ? [options.selectedClipId.value]
        : [];
    const clipIds = [...new Set(requestedIds)].filter((id) => clipsById.has(id));
    const primaryId = options.selectedClipId.value;
    const clip =
      (primaryId && clipIds.includes(primaryId) ? clipsById.get(primaryId) : null) ??
      clipsById.get(clipIds[0] ?? '') ??
      null;
    return { zoom: null, clip, clipIds, zoomIds: [...selectedZoomIds()] };
  };

  const copyItem = (clip: Clip | null, zoom: ZoomElement | null): boolean => {
    const scopeId = options.scopeId.value;
    if (!scopeId) return false;
    let item: TimelineClipboardItem;
    if (zoom) item = clipboard.copyZoom(scopeId, zoom, options.zoomElements.value);
    else if (clip) item = clipboard.copyClip(scopeId, clip, options.assetFor(clip));
    else return false;
    options.emit('clipboard:copied', item);
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

  const canHoldClip = (clip: Clip | null) =>
    clip !== null &&
    clip.enabled &&
    (clip.kind === 'screen' || clip.kind === 'video' || clip.kind === 'webcam') &&
    options.assetFor(clip)?.kind === 'video' &&
    clip.freezeFrameSourceMs === undefined &&
    options.currentTimeMs.value >= clip.timelineStartMs + MIN_CLIP_DURATION_MS &&
    options.currentTimeMs.value <= clip.timelineStartMs + clip.timelineDurationMs - MIN_CLIP_DURATION_MS;

  const contextMenuItems = computed<ContextMenuItemOrDivider[]>(() => {
    const { clip, zoom, clipIds, zoomIds } = contextMenuState.value;
    const canCopy = Boolean(options.scopeId.value && (zoom || clip));
    const locked = selectionHasLocks(options.composition.value, options.zoomElements.value, { clipIds, zoomIds });
    const selectedItems = [
      ...options.composition.value.clips.filter((item) => clipIds.includes(item.id)),
      ...options.zoomElements.value.filter((item) => zoomIds.includes(item.id)),
    ];
    const allLocked = selectedItems.length > 0 && selectedItems.every((item) => item.locked);
    const canHold = !locked && canHoldClip(clip);
    const items: ContextMenuItemOrDivider[] = [];
    if (selectedItems.length)
      items.push(
        {
          id: allLocked ? 'unlock' : 'lock',
          label:
            options.t(allLocked ? 'unlock' : 'lock') + (selectedItems.length > 1 ? ` (${selectedItems.length})` : ''),
          icon: allLocked ? Unlock : Lock,
        },
        { isDivider: true },
      );
    const audioClipIds = clipIds.filter((id) => {
      const selected = options.composition.value.clips.find((item) => item.id === id);
      return selected ? isAudioClip(selected) : false;
    });
    if (clip && (clip.kind === 'screen' || clip.kind === 'video' || clip.kind === 'webcam')) {
      items.push({ id: 'hold', label: options.t('holdSegment'), icon: Pause, disabled: !canHold }, { isDivider: true });
    }
    if (audioClipIds.length) {
      items.push(
        { id: 'normalize-audio', label: options.t('normalizeAudio'), icon: AudioLines, disabled: locked },
        { isDivider: true },
      );
    }
    items.push(
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
        disabled: locked || (clipIds.length === 0 && zoomIds.length === 0),
      },
    );
    const canRipple = Boolean(rippleRangeForSelection(options.composition.value, clipIds));
    items.push({
      id: 'ripple-delete',
      label: options.t('rippleDelete'),
      icon: Trash2,
      danger: true,
      disabled: locked || !canRipple,
    });
    return items;
  });

  const handleContextMenuSelect = (actionId: string) => {
    const { category, clip, zoom, clipIds, zoomIds, trackId } = contextMenuState.value;
    const item = contextMenuItems.value.find((item) => !('isDivider' in item) && item.id === actionId);
    if (item && 'disabled' in item && item.disabled) return;
    if (actionId === 'lock' || actionId === 'unlock')
      options.emit('lock:selection', { clipIds, zoomIds, locked: actionId === 'lock' });
    else if (actionId === 'hold' && clip && canHoldClip(clip))
      options.emit('hold:clip', { id: clip.id, timeMs: options.currentTimeMs.value });
    else if (actionId === 'normalize-audio') options.emit('normalize:audio', clipIds);
    else if (actionId === 'copy') copyItem(clip, zoom);
    else if (actionId === 'paste') pasteClipboard({ category, trackId });
    else if (actionId === 'delete') {
      options.emit('delete:selection', { clipIds, zoomIds, mode: 'lift' });
    } else if (actionId === 'ripple-delete') options.emit('delete:selection', { clipIds, zoomIds, mode: 'ripple' });
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
