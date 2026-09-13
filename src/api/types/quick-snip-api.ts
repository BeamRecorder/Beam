import type {
  QuickSnipConfiguration,
  QuickSnipSnapshot,
  QuickSnipRenderTask,
  QuickSnipRenderReport,
} from './quick-snip';
import type { RecordingSessionResult } from '../../components/hud/recorder/recording-types';
import type { ProjectEditorState } from './capture-api';

export interface QuickSnipApi {
  quickSnipFromHud(options: import('./quick-snip').InstantCaptureOptions): Promise<QuickSnipSnapshot>;
  quickSnipToggle(): Promise<QuickSnipSnapshot>;
  notifyQuickSnipCropReady(): void;
  quickSnipStart(
    overrides?: Partial<Pick<QuickSnipConfiguration, 'mode' | 'automaticZoom' | 'devices' | 'screenshotAction'>>,
  ): Promise<QuickSnipSnapshot>;
  configureQuickSnip(
    overrides: Partial<Pick<QuickSnipConfiguration, 'mode' | 'automaticZoom' | 'devices' | 'screenshotAction'>>,
  ): Promise<QuickSnipSnapshot>;
  chooseQuickSnipDevice(request: import('./quick-snip').QuickSnipDeviceMenu): Promise<string | null>;
  quickSnipStop(): Promise<QuickSnipSnapshot>;
  quickSnipCancel(): Promise<QuickSnipSnapshot>;
  getQuickSnipState(): Promise<QuickSnipSnapshot>;
  reportQuickSnip(event: {
    type:
      | 'recording'
      | 'completed'
      | 'failed'
      | 'screenshot'
      | 'screenshot-captured'
      | 'screenshot-rendered'
      | 'capture-cancelled';
    name?: string;
    screenshotId?: string;
    preview?: string;
    session?: RecordingSessionResult;
    error?: string;
  }): Promise<QuickSnipSnapshot>;
  onQuickSnipConfigure(listener: (configuration: QuickSnipConfiguration) => void): () => void;
  onQuickSnipCommand(listener: (command: 'start' | 'stop' | 'cancel') => void): () => void;
  onQuickSnipStatus(listener: (snapshot: QuickSnipSnapshot) => void): () => void;
  onQuickSnipState(listener: (snapshot: QuickSnipSnapshot) => void): () => void;
  copyQuickSnipFile(path: string): Promise<{ native: boolean; fallback: string | null }>;
  setQuickSnipStatusInteractive(interactive: boolean): void;
  dismissQuickSnipStatus(): void;
  notifyQuickSnipStatusReady(): void;
  onQuickSnipStatusBlur(listener: () => void): () => void;
  openQuickSnipEditor(): Promise<void>;
  getQuickSnipRenderTask(): Promise<QuickSnipRenderTask | null>;
  onQuickSnipRenderTask(listener: (task: QuickSnipRenderTask) => void): () => void;
  saveQuickSnipRenderState(id: string, state: ProjectEditorState): Promise<void>;
  reportQuickSnipRender(report: QuickSnipRenderReport): Promise<void>;
}
