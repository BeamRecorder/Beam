import type { Ref } from 'vue';
import type { CaptureCatalog, CaptureSource, RecorderLauncherContext } from '../../api/types/capture-api';

export type PreviewKind = 'screen' | 'window';

export interface CaptureSourcePreviewOptions {
  platform: string;
  sources: Ref<CaptureSource[]>;
  catalog: Ref<CaptureCatalog | null>;
  selectedScreenId: Ref<string | null>;
  selectedWindowId: Ref<string | null>;
  recorderLauncherContext: () => RecorderLauncherContext | null | undefined;
}
