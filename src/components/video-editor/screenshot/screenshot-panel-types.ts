import type { Ref } from 'vue';
import type { ScreenshotState } from '~/api/types/screenshot';
import type { ScreenshotPanel } from './screenshot-types';
export interface ScreenshotPanelOptions {
  state: Ref<ScreenshotState | null>;
  panel: Ref<ScreenshotPanel>;
  cropping: Ref<boolean>;
  selectedId: Ref<string | null>;
  select: (id: string | null) => void;
  finishDrawing: () => void;
}
