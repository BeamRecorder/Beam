import type { Divider, PanelSizes, ResizeBounds, WorkspaceLayout, WorkspaceSize, WorkspaceMode } from './layoutTypes';

export const GUTTER = 8;
export const HEADER = 40;

/** Concat's 31/47/22 columns and 60/40 rows, bounded by the available client area. */
export function workspaceLayout(size: WorkspaceSize, requested?: PanelSizes): WorkspaceLayout {
  const width = Math.max(0, size.width - 16), height = Math.max(0, size.height - HEADER - 16);
  const columns = Math.max(0, width - 2 * GUTTER);
  const minimum = Math.min(1, columns / 872);
  const libraryMin = 320 * minimum, inspectorMin = 272 * minimum, previewMin = 280 * minimum;
  let library = clamp(requested?.library ?? columns * 0.31, libraryMin, Math.min(640, columns - inspectorMin - previewMin));
  const inspector = clamp(requested?.inspector ?? columns * 0.22, inspectorMin, Math.min(520, columns - library - previewMin));
  library = Math.min(library, columns - inspector - previewMin);
  const rows = Math.max(0, height - GUTTER), scale = Math.min(1, rows / 440);
  const timeline = clamp(requested?.timeline ?? rows * 0.4, 180 * scale, Math.min(640, rows - 260 * scale));
  return { width, height, library, inspector, timeline, preview: columns - library - inspector, top: rows - timeline };
}

/** Small windows keep the selected pane accessible instead of shrinking all three into overflow. */
export function workspaceMode(width: number): WorkspaceMode {
  return width >= 1260 ? 'wide' : width >= 920 ? 'split' : 'compact';
}

/** Stores user splits as proportions, so a later window resize retains their relative sizes. */
export function panelRatios(layout: WorkspaceLayout): PanelSizes {
  const columns = Math.max(1, layout.width - 2 * GUTTER), rows = Math.max(1, layout.height - GUTTER);
  return { library: layout.library / columns, inspector: layout.inspector / columns, timeline: layout.timeline / rows };
}

export function proportionalPanels(size: WorkspaceSize, ratios?: PanelSizes): PanelSizes | undefined {
  if (!ratios) return undefined;
  const columns = Math.max(0, size.width - 16 - 2 * GUTTER), rows = Math.max(0, size.height - HEADER - 16 - GUTTER);
  return { library: columns * ratios.library, inspector: columns * ratios.inspector, timeline: rows * ratios.timeline };
}

/** Native drag limits reserve the other fixed pane and the preview's minimum size. */
export function workspaceDividerBounds(layout: WorkspaceLayout, divider: Divider): ResizeBounds {
  const columns = Math.max(0, layout.width - 2 * GUTTER), scale = Math.min(1, columns / 872);
  if (divider === 'library') return { minimum: 320 * scale, maximum: Math.min(640, columns - layout.inspector - 280 * scale) };
  if (divider === 'inspector') return { minimum: 272 * scale, maximum: Math.min(520, columns - layout.library - 280 * scale) };
  const rows = Math.max(0, layout.height - GUTTER), rowScale = Math.min(1, rows / 440);
  return { minimum: 180 * rowScale, maximum: Math.min(640, rows - 260 * rowScale) };
}

/** Keeps the sidebar and its full-width grab target inside the library. */
export function sidebarWidth(width: number, requested = 104): number {
  return clamp(requested, Math.min(88, width / 2), width / 2);
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, Number.isFinite(value) ? value : low));
}
