import type { LayerBlendMode, LayerCompositing } from './layer-compositing-types';

export const LAYER_BLEND_MODES: readonly LayerBlendMode[] = [
  'source-over',
  'darken',
  'multiply',
  'color-burn',
  'lighten',
  'screen',
  'color-dodge',
  'lighter',
  'overlay',
  'soft-light',
  'hard-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
];
export const defaultLayerCompositing = (id: string): LayerCompositing => ({
  id,
  opacity: 100,
  blendMode: 'source-over',
  locked: false,
});

/** The list is stored back-to-front, like the pixels being composited. */
export function reorderLayer<T extends { id: string }>(layers: readonly T[], id: string, targetIndex: number): T[] {
  const from = layers.findIndex((layer) => layer.id === id);
  if (from < 0 || !Number.isInteger(targetIndex)) return [...layers];
  const result = [...layers];
  result.splice(Math.max(0, Math.min(layers.length - 1, targetIndex)), 0, result.splice(from, 1)[0]!);
  return result;
}
