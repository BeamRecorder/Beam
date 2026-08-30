import { computed, ref, type Ref } from 'vue';
import { ClipboardPaste, Copy, Pause, Trash2 } from '@lucide/vue';
import type { Clip, ClipComposition, MediaAsset } from '~/media/shared/composition-types';
import type { ZoomElement } from '../../zoom/zoom-types';
import type { ContextMenuItemOrDivider } from '~/components/ui/context-menu';
import { getClipCategory, useTimelineClipboard } from './useTimelineClipboard';
import type { TimelineClipboardItem, TimelineItemCategory, TimelinePasteTarget } from './timeline-clipboard-types';
import type { TimelineTracksEmits } from './timeline-tracks-types';
import { MIN_CLIP_DURATION_MS } from '../../composition/engine/clip-engine';
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

  const openTrackContextMenu = (event: MouseEvent, category: TimelineItemCategory, trackId?: string) => {
    event.preventDefault();
    const selected = selectedItem();
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
    const canHold = canHoldClip(clip);
    const items: ContextMenuItemOrDivider[] = [];
    if (clip && (clip.kind === 'screen' || clip.kind === 'video' || clip.kind === 'webcam')) {
      items.push({ id: 'hold', label: options.t('holdSegment'), icon: Pause, disabled: !canHold }, { isDivider: true });
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
        disabled: clipIds.length === 0 && zoomIds.length === 0,
      },
    );
    const canRipple = Boolean(rippleRangeForSelection(options.composition.value, clipIds));
    items.push({
      id: 'ripple-delete',
      label: options.t('rippleDelete'),
      icon: Trash2,
      danger: true,
      disabled: !canRipple,
    });
    return items;
  });

  const handleContextMenuSelect = (actionId: string) => {
    const { category, clip, zoom, clipIds, zoomIds, trackId } = contextMenuState.value;
    if (actionId === 'hold' && clip && canHoldClip(clip))
      options.emit('hold:clip', { id: clip.id, timeMs: options.currentTimeMs.value });
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
