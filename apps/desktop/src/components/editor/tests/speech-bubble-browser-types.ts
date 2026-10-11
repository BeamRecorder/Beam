import type { ShapeClip } from '@beam/engine/shared/composition-types';
import type { ProjectEditorState } from '~/api/types/capture-api';

export interface SpeechBubbleBrowserState {
  ready: boolean;
  settled: boolean;
  frames: number;
  saves: number;
  time: number;
  playback: string;
  error: unknown;
  shape: ShapeClip;
}

export interface SpeechBubbleBrowserHost {
  state(): SpeechBubbleBrowserState;
  select(): Promise<void>;
  clear(): Promise<void>;
  seek(seconds: number): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  undo(): Promise<void>;
  redo(): Promise<void>;
  save(): Promise<ProjectEditorState>;
  reopen(): Promise<void>;
  dispose(): void;
}

declare global {
  interface Window {
    speechBubbleHost: SpeechBubbleBrowserHost;
  }
}
