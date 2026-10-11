import { setTransform } from '@beam/engine/commands/clip-engine';
import { compositionDurationMs } from '@beam/runtime/shared/index';
import type { ClipComposition } from '@beam/engine/shared/composition-types';
import type { ClipTransformUpdate } from './editor-canvas-types';
import { pasteTimelineClipboard } from '../timeline/composables/paste-timeline-clipboard';
import { getClipCategory } from '../timeline/composables/useTimelineClipboard';
import type { TimelineClipboardEntry } from '../timeline/composables/timeline-clipboard-types';
export function duplicateCanvasClips(
  composition: ClipComposition,
  transforms: readonly ClipTransformUpdate[],
  idFactory?: () => string,
) {
  const entries: Extract<TimelineClipboardEntry, { type: 'clip' }>[] = transforms.flatMap(({ id }) => {
    const clip = composition.clips.find((clip) => clip.id === id);
    if (!clip || clip.locked || clip.kind === 'audio') return [];
    return [
      {
        type: 'clip',
        category: getClipCategory(clip),
        clip,
        asset: 'assetId' in clip ? (composition.assets.find((asset) => asset.id === clip.assetId) ?? null) : null,
        descriptor: { kind: 'item', name: clip.name },
      },
    ];
  });
  if (!entries.length) return { composition, ids: [] };
  const startMs = Math.min(...entries.map((entry) => entry.clip.timelineStartMs));
  const pasted = pasteTimelineClipboard({
    composition,
    zoomElements: [],
    timeMs: startMs,
    timelineDurationMs: compositionDurationMs(composition),
    idFactory,
    target: { category: 'visual', placement: 'new-layer' },
    item: {
      type: 'selection',
      scopeId: 'duplicate',
      entries,
      anchorTimeMs: startMs,
      primaryIndex: entries.length - 1,
      descriptor: { kind: 'selection', items: entries.map((entry) => entry.descriptor) },
    },
  });
  let next = pasted.composition;
  entries.forEach((entry, index) => {
    const transform = transforms.find((update) => update.id === entry.clip.id)!.transform;
    next = setTransform(next, pasted.clipIds[index]!, transform);
  });
  return { composition: next, ids: pasted.clipIds };
}
