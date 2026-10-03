import type { ProjectGridLayout } from './project-grid-types';

export const PROJECT_COLUMN_GAP = 8;
export const PROJECT_ROW_GAP = 12;

export function projectGridLayout(width: number, compact: boolean): ProjectGridLayout {
  const availableWidth = Number.isFinite(width) ? Math.max(0, width) : 0;
  const minimumCardSize = compact ? 140 : 180;
  const columns = Math.max(
    1,
    Math.floor((availableWidth + PROJECT_COLUMN_GAP) / (minimumCardSize + PROJECT_COLUMN_GAP)),
  );
  const cardSize = (availableWidth - PROJECT_COLUMN_GAP * (columns - 1)) / columns;
  return { columns, cardSize, rowHeight: cardSize + PROJECT_ROW_GAP };
}
