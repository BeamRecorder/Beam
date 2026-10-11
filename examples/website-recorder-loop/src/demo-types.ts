import type { gsap } from 'gsap';
import type { CaptureMode } from '../../../packages/engine/src/capture/capture-mode';
import type { HudCaptureTarget } from '../../../apps/desktop/src/components/hud/hud-state-types';
import type { RecordingPhase } from '../../../apps/desktop/src/components/hud/recorder/recording-types';

export interface RecorderPose {
  time: number;
  x: number;
  y: number;
  camera: number;
  setupOpacity: number;
  setupScale: number;
  barOpacity: number;
  barY: number;
}
export interface RecorderStep {
  at: number;
  x: number;
  y: number;
  label: string;
  target?: HudCaptureTarget;
  mode?: CaptureMode;
  phase?: RecordingPhase;
}
export interface RecorderWindow extends Window {
  __timelines: Record<string, gsap.core.Timeline>;
  beamComposition: {
    ready: Promise<void>;
    timeline: gsap.core.Timeline;
    seek(timeMs: number): Promise<void>;
  };
}
