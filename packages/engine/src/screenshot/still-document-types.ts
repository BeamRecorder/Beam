import type { ScreenshotState } from './screenshot-types';

/** Portable still document. Asset paths are interpreted only by the chosen host. */
export interface StillDocument {
  version: 1;
  kind: 'image';
  id: string;
  source: string;
  width: number;
  height: number;
  state: ScreenshotState;
  fontSources?: Record<string, string>;
}
