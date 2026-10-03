import type { NormalizedTransform } from '@beam/engine/shared/composition-types';
import type { GpuRect, GpuSceneCommand } from '@beam/runtime/gpu/gpu-scene-types';
import type { ShapeLayerStyle } from '@beam/engine/shared/shape-layer-types';

export interface GpuShapePaintContext {
  matrix: DOMMatrix;
  viewport: GpuRect;
  key: string;
}
export interface CachedGpuShapePlan {
  key: string;
  transform: NormalizedTransform;
  style: ShapeLayerStyle;
  commands: GpuSceneCommand[] | null;
}
