import type { TransitionPreset } from './composition-types';
import type { GpuTransitionPreset } from './transition-types';

export const TRANSITION_EFFECT_KINDS: readonly GpuTransitionPreset['kind'][];
export function isTransitionPreset(preset: unknown, domain?: 'visual' | 'audio'): preset is TransitionPreset;
export function isGpuTransitionPreset(preset: TransitionPreset): preset is GpuTransitionPreset;
