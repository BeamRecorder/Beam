import type { ScreenshotLayerDropTarget } from './screenshot-layer-reorder-types';

/** Geometry is measured in client pixels, so editor UI scaling is already applied. */
export function screenshotLayerDropTarget(
  list: HTMLElement,
  ids: readonly string[],
  draggedId: string,
  x: number,
  y: number,
): ScreenshotLayerDropTarget | null {
  if (![x, y].every(Number.isFinite) || !ids.includes(draggedId)) return null;
  const bounds = list.getBoundingClientRect();
  if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return null;
  const remaining = ids.filter((id) => id !== draggedId);
  const blocks = [...list.querySelectorAll<HTMLElement>('[data-composition-block]')].filter(
    (block) => block.getBoundingClientRect().height > 0 && !block.closest('.layer-leave-active'),
  );
  for (const block of blocks) {
    const rect = block.getBoundingClientRect();
    const previous = blocks[blocks.indexOf(block) - 1]?.getBoundingClientRect();
    if (y < (previous?.bottom ?? bounds.top) || y > rect.top + 8) continue;
    const members = [...block.querySelectorAll<HTMLElement>('[data-layer-id]')].map((row) => row.dataset.layerId!);
    const anchorId = remaining.find((id) => members.includes(id));
    if (anchorId)
      return {
        groupId: null,
        frontIndex: remaining.indexOf(anchorId),
        anchorId,
        side: 'before',
        header: true,
        blockKey: block.dataset.compositionBlock,
      };
  }
  const lastBlock = blocks.at(-1);
  if (lastBlock && y >= lastBlock.getBoundingClientRect().bottom && remaining.length)
    return {
      groupId: null,
      frontIndex: remaining.length,
      anchorId: remaining.at(-1)!,
      side: 'after',
      header: true,
      blockKey: lastBlock.dataset.compositionBlock,
    };
  const headers = [...list.querySelectorAll<HTMLElement>('[data-group-drop]')].filter(
    (header) => !header.closest('.layer-leave-active'),
  );
  for (const header of headers) {
    const rect = header.getBoundingClientRect();
    if (rect.height <= 0 || y < rect.top || y > rect.bottom) continue;
    const members = [...header.parentElement!.querySelectorAll<HTMLElement>('[data-layer-id]')].map(
      (row) => row.dataset.layerId!,
    );
    const anchorId = remaining.find((id) => members.includes(id));
    return anchorId
      ? {
          groupId: y < rect.top + 8 ? null : header.dataset.groupDrop!,
          frontIndex: remaining.indexOf(anchorId),
          anchorId,
          side: 'before',
          header: true,
        }
      : null;
  }
  const rows = [...list.querySelectorAll<HTMLElement>('[data-layer-id]')].filter(
    (row) =>
      row.getBoundingClientRect().height > 0 &&
      row.dataset.layerId !== draggedId &&
      !row.closest('.layer-leave-active,[inert]'),
  );
  const row = rows.find((row) => y < row.getBoundingClientRect().bottom) ?? rows.at(-1);
  if (!row) return null;
  const rect = row.getBoundingClientRect();
  let anchorId = row.dataset.layerId!,
    side: 'before' | 'after' = y < rect.top + rect.height / 2 ? 'before' : 'after';
  const group = row.closest<HTMLElement>('[data-composition-group]');
  let groupId = group?.dataset.compositionGroup ?? null;
  // The unindented strip is a root-list drop zone beside a group's children.
  if (groupId && x < row.getBoundingClientRect().left) {
    const groupRect = group!.getBoundingClientRect();
    side = y < groupRect.top + groupRect.height / 2 ? 'before' : 'after';
    const members = [...group!.querySelectorAll<HTMLElement>('[data-layer-id]')].map(
      (member) => member.dataset.layerId!,
    );
    const orderedMembers = remaining.filter((id) => members.includes(id));
    anchorId = (side === 'before' ? orderedMembers[0] : orderedMembers.at(-1))!;
    groupId = null;
  }
  const index = remaining.indexOf(anchorId);
  return index < 0 ? null : { groupId, frontIndex: index + (side === 'after' ? 1 : 0), anchorId, side, header: false };
}
