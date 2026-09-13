import type { BlurClip } from './composition-types';

/** Highlight shares effect placement and timing; strength controls the outside opacity. */
export const HIGHLIGHT_DEFAULTS: Pick<
  BlurClip,
  'transform' | 'mode' | 'shape' | 'strength' | 'feather' | 'cornerRadius' | 'tintOpacity' | 'color' | 'highlightColor'
> = {
  transform: { x: 0.3, y: 0.3, width: 0.4, height: 0.4 },
  mode: 'highlight',
  shape: 'rectangle',
  strength: 65,
  feather: 0,
  cornerRadius: 8,
  tintOpacity: 20,
  color: '#000000',
  highlightColor: '#ffffff',
};
