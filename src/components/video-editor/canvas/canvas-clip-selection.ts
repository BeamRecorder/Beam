import type { CanvasMarqueeSelection } from './canvas-marquee-types';

export function toggleCanvasClipSelection(
  selectedIds: readonly string[],
  clipId: string,
  event?: Pick<MouseEvent, 'ctrlKey' | 'metaKey' | 'shiftKey'>,
): CanvasMarqueeSelection | null {
  if (!event || (!event.ctrlKey && !event.metaKey && !event.shiftKey)) return null;
  const ids = selectedIds.includes(clipId)
    ? selectedIds.filter((selectedId) => selectedId !== clipId)
    : [...selectedIds, clipId];
  return {
    ids,
    primaryId: selectedIds.includes(clipId) ? (ids.at(-1) ?? null) : clipId,
    additive: false,
  };
}
