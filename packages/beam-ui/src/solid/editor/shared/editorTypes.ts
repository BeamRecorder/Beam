import type { Instance, Definition, Transition, Operation, RecordingStyle, Telemetry, Clip as ClipDetails, ClipOverview as GeneratedClipOverview } from './generated/editorContracts';
export type { Instance, Definition, Transition, Operation, Edit } from './generated/editorContracts';
export type TrackKind = 'video' | 'audio';
export interface Canvas {
  width: number;
  height: number;
  fps: number;
  fpsDenominator?: number;
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
  cursorMode?: Telemetry;
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
export type Clip = ClipDetails;
export type ClipOverview = Omit<GeneratedClipOverview,'effectCount'|'regionCount'> & {
  effectCount?: number;
  regionCount?: number;
};
export type ClipPlacement = Pick<Clip,'id'|'assetId'|'trackId'|'startMs'|'sourceInMs'|'durationMs'|'title'|'rate'|'animationOffsetMs'|'linkGroup'> & {
  generator?: GeneratedClipOverview['generator'];
  effectCount?: number;
  regionCount?: number;
};
export interface Project {
  id: string;
  name: string;
  canvas: Canvas;
  assets: Asset[];
  tracks: Track[];
  clips: ClipPlacement[];
  warnings: string[];
  definitions?: Definition[];
  transitions?: Transition[];
  recordingStyle?: RecordingStyle;
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
  canProjectUndo?: boolean;
  canProjectRedo?: boolean;
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
