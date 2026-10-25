import type { ZoomElement } from './zoom-types';
import type { SplitZoomContinuity } from './zoom-split-types';

/** Adjacent, unmodified parts share the original envelope; separating or editing them releases that continuity. */
export function prepareSplitZoomContinuity(elements: readonly ZoomElement[]): SplitZoomContinuity {
  if (!elements.some((zoom) => zoom.mode === 'auto' && zoom.splitGroupId)) return { elements, elementIdAt: (id) => id };
  const groups: ZoomElement[][] = [];
  const signatures: string[] = [];
  for (const zoom of elements) {
    const signature =
      zoom.mode === 'auto' && zoom.splitGroupId
        ? JSON.stringify({ ...zoom, id: undefined, startMs: undefined, endMs: undefined, linkedClipId: undefined })
        : '';
    const previous = groups.at(-1),
      last = previous?.at(-1);
    if (signature && signatures.at(-1) === signature && last?.endMs === zoom.startMs) previous!.push(zoom);
    else {
      groups.push([zoom]);
      signatures.push(signature);
    }
  }
  const parts = new Map(groups.filter((group) => group.length > 1).map((group) => [group[0]!.id, group]));
  return {
    elements: parts.size
      ? groups.map((group) => (group.length > 1 ? { ...group[0]!, endMs: group.at(-1)!.endMs } : group[0]!))
      : elements,
    elementIdAt(id, timeMs) {
      const group = id ? parts.get(id) : undefined;
      if (!group) return id;
      let left = 0,
        right = group.length;
      while (left < right) {
        const middle = (left + right) >>> 1;
        if (group[middle]!.startMs <= timeMs) left = middle + 1;
        else right = middle;
      }
      return group[Math.max(0, left - 1)]!.id;
    },
  };
}
