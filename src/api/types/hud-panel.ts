import type { CaptureMode } from './capture-mode';

export type HudPanel = 'settings' | 'projects' | 'mascot';
export interface HudProjectRequest {
  id: string;
  mode: CaptureMode;
}
export interface HudPanelApi {
  openHudSettings(): Promise<boolean>;
  openHudProjects(): Promise<boolean>;
  openDeveloperTools(): Promise<void>;
  openMascotLab(): Promise<boolean>;
  notifyHudPanelReady(): void;
  requestHudProject(request: HudProjectRequest): Promise<boolean>;
  onHudProjectRequested(listener: (request: HudProjectRequest) => void): () => void;
}
