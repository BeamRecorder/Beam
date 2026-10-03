import type { GradientControlGroup } from './gradient-panel-types';
import type { GradientNumberKey } from '@beam/engine/gradient/gradient-types';
export const GRADIENT_CONTROL_GROUPS: GradientControlGroup[] = [
  { id: 'surface', keys: ['distortion', 'softness', 'space', 'folds', 'colorSpread'] },
  { id: 'geometry', keys: ['scale', 'rotation', 'offsetX', 'offsetY', 'stretchX', 'stretchY', 'seed'] },
  {
    id: 'structure',
    keys: ['noiseFrequency', 'octaves', 'turbulence', 'swirl', 'curvature', 'foldFrequency', 'lightAngle'],
  },
  { id: 'light', keys: ['exposure', 'contrast', 'saturation'] },
  { id: 'texture', keys: ['grain', 'grainSize', 'vignette'] },
  { id: 'phase', keys: ['frame', 'drift'] },
];
export const gradientControlStep = (key: GradientNumberKey) =>
  ['scale', 'noiseFrequency', 'grainSize', 'frame'].includes(key) ? 0.01 : key === 'foldFrequency' ? 0.1 : 1;
