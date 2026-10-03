export const SELECTION_TOOLTIP_LIMIT = 10;

export function fitSelectionNameCount(
  widths: readonly number[],
  availableWidth: number,
  separatorWidth: number,
  badgeWidth: number,
): number {
  if (!widths.length || availableWidth <= 0) return widths.length ? 1 : 0;
  const fullWidth = widths.reduce((total, width) => total + width, 0) + separatorWidth * (widths.length - 1);
  if (fullWidth <= availableWidth) return widths.length;
  let used = badgeWidth;
  for (let index = 0; index < widths.length; index += 1) {
    const addition = widths[index]! + (index > 0 ? separatorWidth : 0);
    if (index > 0 && used + addition > availableWidth) return index;
    used += addition;
  }
  return 1;
}

export function tooltipSelectionItems(names: readonly string[], limit = SELECTION_TOOLTIP_LIMIT) {
  return {
    visible: names.slice(0, limit),
    remaining: Math.max(0, names.length - limit),
  };
}
