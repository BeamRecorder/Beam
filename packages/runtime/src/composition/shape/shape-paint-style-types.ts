import type { normalizeShapeLayerStyle } from '@beam/engine/shared/shape-layer-style';

export interface CachedShapePaintStyle {
  values: readonly unknown[];
  style: ReturnType<typeof normalizeShapeLayerStyle>;
}
