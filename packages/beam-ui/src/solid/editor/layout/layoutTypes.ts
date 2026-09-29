export interface WorkspaceSize { width: number; height: number }
export interface PanelSizes { library: number; inspector: number; timeline: number }
export type Divider = keyof PanelSizes;
export type WorkspacePane = 'media' | 'preview' | 'properties';
export type WorkspaceMode = 'wide' | 'split' | 'compact';
export interface WorkspaceLayout extends PanelSizes { preview: number; top: number; width: number; height: number }

export interface SplitterProps {
  id: string; label: string; vertical?: boolean; hairline?: boolean;
  target: string; trailing?: boolean; minimum: number; maximum: number;
  value: number; onCommit: (value: number) => void;
}
export interface ResizeBounds { minimum: number; maximum: number }
export interface SplitterGeometry {
  width: number | '100%'; height: number | '100%';
  pillWidth: number; pillHeight: number;
  hitWidth: number | '100%'; hitHeight: number | '100%';
  inset: { start: number; top: number };
  orientation: 'vertical' | 'horizontal'; cursor: 'ewResize' | 'nsResize';
}
