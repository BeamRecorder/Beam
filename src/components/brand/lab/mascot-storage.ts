import { EXPRESSIONS } from '../Beamy/engine/expressions';
import { SHAPES } from '../Beamy/engine/skins';
import { SEQUENCE } from '../Beamy/engine/states';
import { DEFAULT_LOOK, DEFAULT_TIMELINE } from './mascot-catalog';
import type { MascotLook, MascotPreset, MascotStep } from './mascot-types';

export const PRESET_KEY = 'beam.mascot-lab.v1';

export function parsePreset(text: string): MascotPreset {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null) throw new Error('Ce fichier ne contient pas de réglages valides.');
  const value = parsed as Record<string, unknown>;
  if (typeof value.look !== 'object' || value.look === null)
    throw new Error('Ce fichier ne contient pas de réglages valides.');
  const look = value.look as Record<string, unknown>;
  if (
    value?.version !== 1 ||
    !SHAPES.some((s) => s.id === look.shape) ||
    !EXPRESSIONS.some((e) => e.id === look.expression) ||
    typeof look.color !== 'string' ||
    !/^#[0-9a-f]{6}$/i.test(look.color) ||
    typeof look.eyes !== 'string' ||
    !['sparkle', 'star', 'capsule'].includes(look.eyes) ||
    typeof look.blush !== 'boolean' ||
    !Array.isArray(value.timeline) ||
    !value.timeline.length ||
    value.timeline.length > 32 ||
    !value.timeline.every((step: unknown) => {
      if (typeof step !== 'object' || step === null || !('state' in step) || !('duration' in step)) return false;
      return (
        SEQUENCE.includes(step.state as MascotPreset['timeline'][number]['state']) &&
        typeof step.duration === 'number' &&
        Number.isFinite(step.duration) &&
        step.duration >= 0.6 &&
        step.duration <= 10
      );
    })
  ) {
    throw new Error('Ce fichier ne contient pas un look et une séquence valides pour la mascotte Beam.');
  }
  return {
    version: 1,
    look: {
      shape: look.shape,
      color: look.color,
      expression: look.expression,
      eyes: look.eyes,
      blush: look.blush,
    } as MascotLook,
    timeline: value.timeline.map((step: unknown) => {
      const validated = step as MascotStep;
      return { state: validated.state, duration: validated.duration };
    }),
  };
}

export function defaultPreset(): MascotPreset {
  return { version: 1, look: { ...DEFAULT_LOOK }, timeline: DEFAULT_TIMELINE.map((step) => ({ ...step })) };
}
