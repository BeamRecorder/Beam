import type { EditorOpenOptions } from './editor-window';
import type { SnapshotHistory } from '~/media/shared/editor-history-types';
import type { ScreenRegion } from './screen-region';
import type { EditorPresetSettings } from './editor-preset';
import type { BlurClip, ShapeClip, VisualClip, MediaAsset } from '~/media/shared/composition-types';
import type { OutputCanvasSettings } from '~/components/video-editor/canvas/output-canvas';
import type { BackgroundValue } from '~/components/video-editor/composables/backgroundCatalog';
import type {
  ScreenshotCursorLayer,
  ScreenshotImageLayer,
} from '~/components/video-editor/screenshot/screenshot-layer-types';
import type { LayerCompositing } from '~/media/shared/layer-compositing-types';

export interface ScreenshotCaptureOptions {
  screenKind: 'display' | 'window';
  screenId?: string;
  region?: ScreenRegion | null;
  excludedWindowHandles?: string[];
}
export interface ScreenshotState {
  canvas: OutputCanvasSettings;
  background: BackgroundValue | null;
  blurPercent: number;
  image: VisualClip;
  shapes: ShapeClip[];
  effects?: BlurClip[];
  cursors?: ScreenshotCursorLayer[];
  images?: ScreenshotImageLayer[];
  composition?: LayerCompositing[];
  format: 'png' | 'webp';
  quality: number;
}
export interface ScreenshotDocument {
  createdAt?: string;
  updatedAt?: string;
  id: string;
  name: string;
  width: number;
  height: number;
  source: string;
  preset: EditorPresetSettings;
  state: ScreenshotState | null;
  history?: SnapshotHistory<ScreenshotState>;
}
export interface ScreenshotApi {
  pickScreenshotImage(id: string): Promise<MediaAsset | null>;
  pasteScreenshotClipboardImage(id: string): Promise<MediaAsset | null>;
  discardScreenshotImage(id: string, source: string): Promise<void>;
  captureScreenshot(options: ScreenshotCaptureOptions): Promise<ScreenshotDocument | null>;
  getScreenshot(id: string): Promise<ScreenshotDocument>;
  listScreenshots(): Promise<ScreenshotDocument[]>;
  saveScreenshot(id: string, state: ScreenshotState, history?: SnapshotHistory<ScreenshotState>): Promise<void>;
  openScreenshot(id: string, options?: EditorOpenOptions): Promise<void>;
  exportScreenshot(id: string, bytes: ArrayBuffer, format: 'png' | 'webp', copy: boolean): Promise<string | null>;
}
