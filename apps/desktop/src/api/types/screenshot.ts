import type { ScreenshotState } from '@beam/engine/screenshot/screenshot-types';
import type { EditorOpenOptions } from './editor-window';
import type { SnapshotHistory } from '@beam/engine/shared/editor-history-types';
import type { ScreenRegion } from './screen-region';
import type { EditorPresetSettings } from './editor-preset';
import type { MediaAsset } from '@beam/engine/shared/composition-types';

export interface ScreenshotCaptureOptions {
  screenKind: 'display' | 'window';
  screenId?: string;
  region?: ScreenRegion | null;
  excludedWindowHandles?: string[];
}
export interface CanvasScreenshotInput {
  bytes: ArrayBuffer;
  name: string;
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
  createScreenshotFromCanvas(input: CanvasScreenshotInput): Promise<ScreenshotDocument>;
  getScreenshot(id: string): Promise<ScreenshotDocument>;
  listScreenshots(): Promise<ScreenshotDocument[]>;
  saveScreenshot(id: string, state: ScreenshotState, history?: SnapshotHistory<ScreenshotState>): Promise<void>;
  openScreenshot(id: string, options?: EditorOpenOptions): Promise<void>;
  exportScreenshot(id: string, bytes: ArrayBuffer, format: 'png' | 'webp', copy: boolean): Promise<string | null>;
}
