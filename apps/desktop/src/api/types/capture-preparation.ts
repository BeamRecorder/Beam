import type { RegionRecordingSettings } from './screen-region';
import type { QuickSnipDeviceMenu } from './quick-snip';
import type { QuickSnipSettingsAnchor, QuickSnipSettingsContent } from './quick-snip-settings';

export interface CapturePreparationApi {
  fitBar(contentWidth: number): Promise<number>;
  configure(settings: RegionRecordingSettings): Promise<void>;
  toggleSettings(anchor: QuickSnipSettingsAnchor): Promise<void>;
  chooseDevice(request: QuickSnipDeviceMenu): Promise<string | null>;
  update(settings: RegionRecordingSettings): Promise<void>;
  onChanged(listener: (settings: RegionRecordingSettings) => void): () => void;
  onConfigure(listener: (settings: RegionRecordingSettings) => void): () => void;
  onContent(listener: (content: QuickSnipSettingsContent) => void): () => void;
  onSettingsVisibility(listener: (visible: boolean) => void): () => void;
  selectDevice(id: string): void;
  ready(): void;
  fit(height: number): void;
  dismiss(): void;
  close(): void;
}
