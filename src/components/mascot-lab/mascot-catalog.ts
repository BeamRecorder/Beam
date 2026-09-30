import { BotEngine } from './bot/engine';
import { EXPRESSION_BY_ID } from './bot/expressions';
import { SHAPE_BY_ID } from './bot/skins';
import { RAYON } from './bot/repere';
import type { ExpressionId, ShapeId, StateId } from './bot/bot-types';
import type { MascotLook, MascotStep } from './mascot-types';

export const DEFAULT_LOOK: MascotLook = {
  shape: 'galet',
  color: '#ff5a1f',
  expression: 'surpris',
  eyes: 'sparkle',
  blush: true,
};
export const DEFAULT_TIMELINE: MascotStep[] = [
  { state: 'idle', duration: 2 },
  { state: 'thinking', duration: 2 },
  { state: 'orbit', duration: 3 },
  { state: 'wink', duration: 2 },
];
export const STATE_LABELS: Record<StateId, string> = {
  idle: 'Au repos',
  thinking: 'Réflexion',
  wink: 'Clin d’œil',
  wide: 'Émerveillement',
  alert: 'Attention',
  notify: 'Notification',
  exclaim: 'Eurêka !',
  sleep: 'Sommeil',
  egg: 'Petit œuf',
  hexagon: 'Hexagone',
  play: 'Lecture',
  orbit: 'En orbite',
  burst: 'Confettis',
  comet: 'Comète',
  swirl: 'Tourbillon',
};
export const SHAPE_LABELS: Record<ShapeId, string> = {
  cercle: 'Bulle',
  galet: 'Galet',
  squircle: 'Coussin',
  capsule: 'Mochi',
  triangle: 'Triangle',
  hexagone: 'Hexagone',
  nuage: 'Nuage',
  goutte: 'Goutte',
};
export const EXPRESSION_LABELS: Record<ExpressionId, string> = {
  neutre: 'Neutre',
  attentif: 'Attentif',
  surpris: 'Émerveillé',
  excite: 'Excité',
  heureux: 'Heureux',
  hilare: 'Hilare',
  colere: 'Fâché',
  triste: 'Triste',
  effraye: 'Effrayé',
  mefiant: 'Méfiant',
  confus: 'Confus',
  curieux: 'Curieux',
  fier: 'Fier',
  timide: 'Timide',
  blase: 'Blasé',
  somnolent: 'Endormi',
};
export const PALETTE = [
  '#ff5a1f',
  '#f0b429',
  '#e8483f',
  '#e152b0',
  '#8b5cf6',
  '#3b93f0',
  '#2fbfa0',
  '#3ecf8e',
  '#8b5e3c',
  '#a3a3a3',
  '#f1efe9',
  '#0a0a0c',
];

export function createMascotEngine(look: MascotLook, state: StateId = 'idle'): BotEngine {
  const engine = new BotEngine(
    RAYON,
    state,
    SHAPE_BY_ID.get(look.shape)!.radii,
    EXPRESSION_BY_ID.get(look.expression)!,
  );
  engine.setEyes(look.eyes, -1);
  return engine;
}

export function timelineDuration(steps: MascotStep[]): number {
  return steps.reduce((total, step) => total + step.duration, 0);
}

export function timelinePosition(steps: MascotStep[], time: number): { index: number; offset: number; start: number } {
  let start = 0;
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index]!;
    if (time < start + step.duration || index === steps.length - 1) {
      return { index, offset: Math.max(0, time - start), start };
    }
    start += step.duration;
  }
  return { index: -1, offset: 0, start: 0 };
}
