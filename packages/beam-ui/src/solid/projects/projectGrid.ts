/** Responsive two-to-four-column artwork geometry for the Projects window. */
export function projectGrid(width: number) {
  const contentWidth = Math.max(320, width - 36)
  const gap = 12
  const columns = Math.max(2, Math.min(4, Math.floor((contentWidth + gap) / 232)))
  const cardWidth = (contentWidth - (columns - 1) * gap) / columns
  const previewHeight = Math.round(cardWidth * 9 / 16)
  return { columns, cardWidth, previewHeight, rowHeight: previewHeight + 65, gap }
}
