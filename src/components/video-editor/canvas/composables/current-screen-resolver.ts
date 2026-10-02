import type { ClipComposition } from '@beam/engine/shared/composition-types';
import { createCompositionScreenResolver } from '@beam/engine/composition/scene-layers';

export function createCurrentScreenResolver(composition: () => ClipComposition) {
  let current = composition();
  let resolve = createCompositionScreenResolver(current);
  const invalidate = () => {
    current = composition();
    resolve = createCompositionScreenResolver(current);
  };
  return {
    at: (timeMs: number) => {
      if (current !== composition()) invalidate();
      return resolve(timeMs);
    },
    invalidate,
  };
}
