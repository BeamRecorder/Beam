import { shadowOffset } from '@beam/engine/shared/shadow';
import type { ShadowDirection } from '@beam/runtime/cursor/shadow-types';

export function cursorShadowOffset(blur: number, direction: ShadowDirection, distance?: number) {
  return shadowOffset(direction, distance, Math.round(blur * 0.4));
}
