import type { BackgroundMedia } from '@beam/engine/shared/background-types';
import type { ScreenshotDocument } from '~/api/types/screenshot';
import type { EditorPresetDocument } from '~/api/types/editor-preset';

export type ScreenshotStartupData = [ScreenshotDocument, BackgroundMedia[], EditorPresetDocument];
export interface ScreenshotLoadReport {
  projectId: string;
  status: 'loading' | 'ready' | 'error';
  totalMs: number;
  timings: Record<string, number>;
  scene?: { images: number; shapes: number; layers: number; historySnapshots: number };
  preview?: { width: number; height: number };
  error?: string;
}
export interface ScreenshotStartup {
  start(id: string): void;
  load(id: string): Promise<ScreenshotStartupData>;
  measure<T>(stage: string, action: () => Promise<T>): Promise<T>;
  time<T>(stage: string, action: () => T): T;
  record(stage: string, milliseconds: number): void;
  finish(width: number, height: number): void;
  fail(reason: unknown): void;
  report(): ScreenshotLoadReport | null;
}
