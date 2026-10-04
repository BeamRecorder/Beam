export interface ScreenshotLayerGroupDrop {
  canDrop: (id: string, groupId: string | null) => boolean;
  commit: (id: string, groupId: string | null, frontIndex: number) => void;
}
export interface ScreenshotLayerDropTarget {
  groupId: string | null;
  frontIndex: number;
  anchorId: string;
  side: 'before' | 'after';
  header: boolean;
  blockKey?: string;
}
