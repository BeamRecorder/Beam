import {
  captionLayerKey,
  isCaptionClip,
  isCompositingClip,
  type ClipComposition,
} from '@beam/engine/shared/composition-types';
import { createClipPasteTransaction } from '@beam/engine/commands/clip-paste';
import { CompositionEngineError } from '@beam/engine/commands/clip-composition-validation';
import { pasteZoomAt } from '@beam/engine/zoom/zoom-paste';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';
import { resolveCaptionPastePlacement } from './caption-paste-placement';
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
  if (!entries.length || !Number.isFinite(options.timelineDurationMs) || options.timelineDurationMs < 0)
    throw new CompositionEngineError('Invalid paste position.');
  const anchorMs = options.item.type === 'selection' ? options.item.anchorTimeMs : entryStartMs(entries[0]!);
  // Plan the complete destination before staging any item. Zooms may appear
  // before clips in a mixed bundle, and every item must keep its full duration.
  const timelineDurationMs = entries.reduce((end, entry) => {
    const start = Math.round(options.timeMs + entryStartMs(entry) - anchorMs);
    const duration = entry.type === 'clip' ? entry.clip.timelineDurationMs : entry.zoom.endMs - entry.zoom.startMs;
    return Math.max(end, start + Math.round(duration));
  }, Math.round(options.timelineDurationMs));
  const primaryIndex = options.item.type === 'selection' ? options.item.primaryIndex : 0;
  const trackIds = new Map<string, string>();
  const captionPlacement = resolveCaptionPastePlacement({
    composition: options.composition,
    captions: entries.flatMap((entry) => (entry.type === 'clip' && isCaptionClip(entry.clip) ? [entry.clip] : [])),
    placement: options.target?.placement,
    idFactory,
  });
  let targetTrackClaimed = false;
  const transaction = createClipPasteTransaction(captionPlacement.composition);
  let zoomElements = options.zoomElements;
  const clipIds: string[] = [];
  const zoomIds: string[] = [];
  const pastedByIndex: Array<{
    type: TimelineClipboardEntry['type'];
    id: string;
  }> = [];

  const destinationTrackId = (entry: Extract<TimelineClipboardEntry, { type: 'clip' }>) => {
    if (!isCompositingClip(entry.clip)) return null;
    const sourceTrackId = entry.clip.trackId!;
    const mapped = trackIds.get(sourceTrackId);
    if (mapped) return mapped;
    let next = sourceTrackId;
    if (options.target?.placement === 'new-layer' || options.target?.placement === 'auto') next = idFactory();
    else if (options.target?.category === 'visual' && options.target.trackId && !targetTrackClaimed) {
      next = options.target.trackId;
      targetTrackClaimed = true;
    } else if (options.item.type === 'selection' && options.target?.category === 'visual') next = idFactory();
    trackIds.set(sourceTrackId, next);
    return next;
  };

  const copiedClipFor = (entry: Extract<TimelineClipboardEntry, { type: 'clip' }>) => {
    if (!isCaptionClip(entry.clip)) return entry.clip;
    const layerId = captionPlacement.layerIds.get(captionLayerKey(entry.clip));
    return layerId ? { ...entry.clip, captionLayerId: layerId } : entry.clip;
  };

  entries.forEach((entry, index) => {
    const timeMs = options.timeMs + entryStartMs(entry) - anchorMs;
    if (entry.type === 'clip') {
      const clipId = transaction.paste(copiedClipFor(entry), {
        timelineStartMs: timeMs,
        timelineDurationMs,
        targetTrackId: destinationTrackId(entry),
        asset: entry.asset,
        idFactory,
      });
      clipIds.push(clipId);
      pastedByIndex[index] = { type: 'clip', id: clipId };
    } else {
      const pasted = pasteZoomAt(zoomElements, entry.zoom, timeMs, timelineDurationMs, idFactory);
      zoomElements = pasted.elements;
      zoomIds.push(pasted.zoomId);
      pastedByIndex[index] = { type: 'zoom', id: pasted.zoomId };
    }
  });

  const primary = pastedByIndex[Math.max(0, Math.min(primaryIndex, pastedByIndex.length - 1))]!;
  return {
    composition: clipIds.length ? transaction.finish() : options.composition,
    zoomElements,
    clipIds,
    zoomIds,
    primary,
  };
}
