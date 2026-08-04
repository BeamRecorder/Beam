import type { ShadowDirection } from './shadow-types';

export function cursorShadowOffset(blur: number, direction: ShadowDirection) {
  const offset = Math.round(blur * 0.4);
  if (direction === 'top-left') return { x: -offset, y: -offset };
  if (direction === 'bottom-right') return { x: offset, y: offset };
  if (direction === 'bottom') return { x: 0, y: offset };
  return { x: 0, y: 0 };
}
