import type { NormalizedTransform } from '@beam/engine/shared/composition-types';
import type { GpuRect, GpuSceneCommand } from '@beam/runtime/gpu/gpu-scene-types';

export interface GpuShapePaintContext {
  matrix: DOMMatrix;
  viewport: GpuRect;
  key: string;
}
export interface CachedGpuShapePlan {
  key: string;
  transform: NormalizedTransform;
  commands: GpuSceneCommand[] | null;
}
