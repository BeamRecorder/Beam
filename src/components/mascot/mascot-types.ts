import type { BotFrame } from '../mascot-lab/bot/bot-types';

export type MascotPhase = 'idle' | 'preparing' | 'recording' | 'paused' | 'processing' | 'completed' | 'failed';

export interface MascotMotionFrame {
  frame: BotFrame;
  transform: string;
}
