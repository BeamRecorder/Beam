export interface ProjectState {
  projectId: string;
  layerId?: string;
  audioClipId?: string;
  audioHash?: string;
}
export interface Snapshot {
  revision: number;
  document: { canvas: Record<string, unknown>; composition: { clips: Array<{ id: string }> } };
}
export interface ImportedAsset {
  id: string;
  kind: 'audio';
  name: string;
  src: string;
  fileName: string;
  durationMs: number;
  width: null;
  height: null;
  origin: 'project';
}
export interface PublishedHtml {
  layerId: string;
  revision: number;
}
