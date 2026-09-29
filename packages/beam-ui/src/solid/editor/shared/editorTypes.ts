export type TrackKind = 'video' | 'audio';
export interface Canvas {
  width: number;
  height: number;
  fps: number;
  background: number;
}
export interface Zoom {
  startMs: number;
  endMs: number;
  cx: number;
  cy: number;
  scale: number;
}
export interface Asset {
  id: string;
  name: string;
  durationMs: number;
  width: number;
  height: number;
  hasVideo: boolean;
  hasAudio: boolean;
  isImage?: boolean;
  hasCursor: boolean;
  zoomCount: number;
  recording: boolean;
}
export interface Track {
  id: string;
  name: string;
  kind: TrackKind;
  muted: boolean;
  hidden: boolean;
}
export interface Effects {
  opacity: number;
  volume: number;
  brightness: number;
  saturation: number;
  scale: number;
  x: number;
  y: number;
  autoZoom: boolean;
  fadeInMs?: number;
  fadeOutMs?: number;
}
export interface Title {
  text: string; font: string; bold: boolean; italic: boolean; size: number;
  color: number; shadow: boolean; background: boolean;
}
export type PreviewQuality = 'full' | 'half' | 'quarter';
export interface Clip {
  id: string;
  assetId: string;
  trackId: string;
  startMs: number;
  sourceInMs: number;
  durationMs: number;
  effects: Effects;
  title?: Title;
}
export interface Project {
  id: string;
  name: string;
  canvas: Canvas;
  assets: Asset[];
  tracks: Track[];
  clips: Clip[];
  warnings: string[];
}
export interface Transport {
  positionMs: number;
  durationMs: number;
  playing: boolean;
  error: string | null;
}
export interface Snapshot {
  activeSequence: string;
  sequences: { id: string; name: string }[];
  project: Project;
  revision: number;
  canUndo: boolean;
  canRedo: boolean;
  recovered: boolean;
  transport: Transport;
  exportFormats: ExportEncoding[];
}
export interface ExportEncoding {
  container: 'mp4' | 'webm';
  codec: string;
  encoder: string;
}
export interface Frame {
  transport: Transport;
  canvasId: number | null;
}
export interface ExportStatus {
  phase: 'idle' | 'rendering' | 'completed' | 'cancelled' | 'failed';
  progress: number;
  error: string | null;
}
export type Edit =
  | { type: 'addSequence'; name: string }
  | { type: 'selectSequence' | 'removeSequence'; id: string }
  | { type: 'renameSequence'; id: string; name: string }
  | { type: 'rename'; name: string }
  | { type: 'canvas'; canvas: Canvas }
  | { type: 'addTrack'; name: string; kind: TrackKind }
  | { type: 'track'; id: string; muted: boolean; hidden: boolean }
  | { type: 'insert'; assetId: string; trackId: string; startMs: number }
  | { type: 'insertTitle'; title: Title; startMs: number }
  | { type: 'title'; id: string; title: Title }
  | { type: 'move'; id: string; trackId: string; startMs: number }
  | { type: 'trim'; id: string; sourceInMs: number; durationMs: number; startMs: number }
  | { type: 'split'; id: string; timeMs: number }
  | { type: 'remove'; id: string }
  | { type: 'effects'; id: string; effects: Effects }
  | { type: 'undo' | 'redo' };
