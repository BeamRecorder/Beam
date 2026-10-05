import type { AnimatedFramePreset, AnimatedFrameSettings } from './animated-frame-types';
export const ANIMATED_FRAME_PRESETS: readonly AnimatedFramePreset[];
export function validateAnimatedFrame(value: unknown): asserts value is AnimatedFrameSettings;
