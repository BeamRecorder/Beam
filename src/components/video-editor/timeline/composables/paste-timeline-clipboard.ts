import {
  captionLayerKey,
  isCaptionClip,
  isCompositingClip,
  type ClipComposition,
} from '~/media/shared/composition-types';
import { pasteClipAt } from '../../composition/engine/clip-paste';
import { pasteZoomAt } from '../../zoom/zoom-paste';
import type { ZoomElement } from '../../zoom/zoom-types';
import type {
  TimelineClipboardEntry,
  TimelineClipboardItem,
  TimelinePasteHighlight,
  TimelinePasteTarget,
} from './timeline-clipboard-types';

export interface TimelineClipboardPasteResult {
  composition: ClipComposition;
  zoomElements: ZoomElement[];
  clipIds: string[];
  zoomIds: string[];
  primary: Omit<TimelinePasteHighlight, 'timestamp'>;
}

const entriesFor = (item: TimelineClipboardItem): TimelineClipboardEntry[] =>
  item.type === 'selection'
    ? item.entries
    : item.type === 'clip'
      ? [
          {
            type: 'clip',
            category: item.category,
            clip: item.clip,
            asset: item.asset,
            descriptor: item.descriptor,
          },
        ]
      : [
          {
            type: 'zoom',
            category: 'zoom',
            zoom: item.zoom,
            descriptor: item.descriptor,
          },
        ];

const entryStartMs = (entry: TimelineClipboardEntry) =>
  entry.type === 'clip' ? entry.clip.timelineStartMs : entry.zoom.startMs;

export function pasteTimelineClipboard(options: {
  composition: ClipComposition;
  zoomElements: ZoomElement[];
  item: TimelineClipboardItem;
  timeMs: number;
  timelineDurationMs: number;
  target?: TimelinePasteTarget | null;
  idFactory?: () => string;
}): TimelineClipboardPasteResult {
  const idFactory = options.idFactory ?? (() => crypto.randomUUID());
  const entries = entriesFor(options.item);
  const anchorMs = options.item.type === 'selection' ? options.item.anchorTimeMs : entryStartMs(entries[0]!);
  const primaryIndex = options.item.type === 'selection' ? options.item.primaryIndex : 0;
  const trackIds = new Map<string, string>();
  const captionLayerIds = new Map<string, string>();
  let targetTrackClaimed = false;
  let composition = options.composition;
  let zoomElements = options.zoomElements;
  const clipIds: string[] = [];
  const zoomIds: string[] = [];
  const pastedByIndex: Array<{ type: TimelineClipboardEntry['type']; id: string }> = [];

  const destinationTrackId = (entry: Extract<TimelineClipboardEntry, { type: 'clip' }>) => {
    if (!isCompositingClip(entry.clip)) return null;
    const sourceTrackId = entry.clip.trackId!;
    const mapped = trackIds.get(sourceTrackId);
    if (mapped) return mapped;
    let next = sourceTrackId;
    if (options.target?.placement === 'new-layer') next = idFactory();
    else if (options.target?.category === 'visual' && options.target.trackId && !targetTrackClaimed) {
      next = options.target.trackId;
      targetTrackClaimed = true;
    } else if (options.item.type === 'selection' && options.target?.category === 'visual') next = idFactory();
    trackIds.set(sourceTrackId, next);
    return next;
  };

  const copiedClipFor = (entry: Extract<TimelineClipboardEntry, { type: 'clip' }>) => {
    if (options.target?.placement !== 'new-layer' || !isCaptionClip(entry.clip)) return entry.clip;
    const sourceLayerId = captionLayerKey(entry.clip);
    let destinationLayerId = captionLayerIds.get(sourceLayerId);
    if (!destinationLayerId) {
      destinationLayerId = idFactory();
      captionLayerIds.set(sourceLayerId, destinationLayerId);
    }
    return { ...entry.clip, captionLayerId: destinationLayerId };
  };

  entries.forEach((entry, index) => {
    const timeMs = options.timeMs + entryStartMs(entry) - anchorMs;
    if (entry.type === 'clip') {
      const pasted = pasteClipAt(composition, copiedClipFor(entry), {
        timelineStartMs: timeMs,
        timelineDurationMs: options.timelineDurationMs,
        targetTrackId: destinationTrackId(entry),
        asset: entry.asset,
        idFactory,
      });
      composition = pasted.composition;
      clipIds.push(pasted.clipId);
      pastedByIndex[index] = { type: 'clip', id: pasted.clipId };
    } else {
      const pasted = pasteZoomAt(zoomElements, entry.zoom, timeMs, options.timelineDurationMs, idFactory);
      zoomElements = pasted.elements;
      zoomIds.push(pasted.zoomId);
      pastedByIndex[index] = { type: 'zoom', id: pasted.zoomId };
    }
  });

  const primary = pastedByIndex[Math.max(0, Math.min(primaryIndex, pastedByIndex.length - 1))]!;
  return { composition, zoomElements, clipIds, zoomIds, primary };
}
