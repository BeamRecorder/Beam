import type { BotFrame } from './engine/bot-types';

export type BeamyPhase =
  | 'idle'
  | 'loading'
  | 'preparing'
  | 'recording'
  | 'paused'
  | 'processing'
  | 'completed'
  | 'failed';

export interface BeamyMotionFrame {
  frame: BotFrame;
  transform: string;
  shape: number[];
}
