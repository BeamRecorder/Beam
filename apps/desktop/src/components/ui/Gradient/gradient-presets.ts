import type { GradientPreset } from './gradient-types';

export const DEFAULT_PRESETS: GradientPreset[] = [
  {
    id: 'Fire',
    stops: [
      { id: 'f1', position: 0, color: '#000000', alpha: 1 },
      { id: 'f2', position: 0.2, color: '#ff4500', alpha: 1 },
      { id: 'f3', position: 0.5, color: '#ff8c00', alpha: 1 },
      { id: 'f4', position: 1, color: '#ffff00', alpha: 1 },
    ],
  },
  {
    id: 'Ocean',
    stops: [
      { id: 'o1', position: 0, color: '#001219', alpha: 1 },
      { id: 'o2', position: 0.4, color: '#005f73', alpha: 1 },
      { id: 'o3', position: 0.7, color: '#0a9396', alpha: 1 },
      { id: 'o4', position: 1, color: '#94d2bd', alpha: 1 },
    ],
  },
  {
    id: 'Sunset',
    stops: [
      { id: 's1', position: 0, color: '#312244', alpha: 1 },
      { id: 's2', position: 0.3, color: '#d90429', alpha: 1 },
      { id: 's3', position: 0.6, color: '#f72585', alpha: 1 },
      { id: 's4', position: 1, color: '#ffb703', alpha: 1 },
    ],
  },
  {
    id: 'Neon',
    stops: [
      { id: 'n1', position: 0, color: '#7209b7', alpha: 1 },
      { id: 'n2', position: 0.5, color: '#b5179e', alpha: 1 },
      { id: 'n3', position: 1, color: '#4cc9f0', alpha: 1 },
    ],
  },
  {
    id: 'Forest',
    stops: [
      { id: 'fo1', position: 0, color: '#004b23', alpha: 1 },
      { id: 'fo2', position: 0.3, color: '#007200', alpha: 1 },
      { id: 'fo3', position: 0.6, color: '#38b000', alpha: 1 },
      { id: 'fo4', position: 1, color: '#ccff33', alpha: 1 },
    ],
  },
  {
    id: 'Gold',
    stops: [
      { id: 'g1', position: 0, color: '#582f0e', alpha: 1 },
      { id: 'g2', position: 0.4, color: '#7f4f24', alpha: 1 },
      { id: 'g3', position: 0.7, color: '#b08968', alpha: 1 },
      { id: 'g4', position: 1, color: '#ede0d4', alpha: 1 },
    ],
  },
  {
    id: 'Ice',
    stops: [
      { id: 'i1', position: 0, color: '#caf0f8', alpha: 1 },
      { id: 'i2', position: 0.5, color: '#ade8f4', alpha: 1 },
      { id: 'i3', position: 1, color: '#0077b6', alpha: 1 },
    ],
  },
  {
    id: 'Vaporwave',
    stops: [
      { id: 'v1', position: 0, color: '#ff71ce', alpha: 1 },
      { id: 'v2', position: 0.25, color: '#01cdfe', alpha: 1 },
      { id: 'v3', position: 0.5, color: '#05ffa1', alpha: 1 },
      { id: 'v4', position: 0.75, color: '#b967ff', alpha: 1 },
      { id: 'v5', position: 1, color: '#fffb96', alpha: 1 },
    ],
  },
  {
    id: 'Aurora',
    stops: [
      { id: 'a1', position: 0, color: '#011627', alpha: 1 },
      { id: 'a2', position: 0.4, color: '#2ec4b6', alpha: 1 },
      { id: 'a3', position: 0.7, color: '#e71d36', alpha: 1 },
      { id: 'a4', position: 1, color: '#ff9f1c', alpha: 1 },
    ],
  },
];
