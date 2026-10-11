import { matchesGesture } from './action-bindings';
import type { ModifierState } from './action-types';
export function constrainPointerDelta<T extends { x: number; y: number }>(delta: T, event: ModifierState): T {
  if (!matchesGesture(event, 'constrain')) return delta;
  return Math.abs(delta.x) >= Math.abs(delta.y) ? { ...delta, y: 0 } : { ...delta, x: 0 };
}
export function additiveSelection(event: ModifierState): boolean {
  return matchesGesture(event, 'addSelection') || matchesGesture(event, 'rangeSelection');
}

export function pointerSelectionIsAdditive(event: ModifierState, alreadySelected: boolean): boolean {
  if (alreadySelected && (matchesGesture(event, 'duplicate') || matchesGesture(event, 'constrain'))) return false;
  return matchesGesture(event, 'addSelection') || (!alreadySelected && matchesGesture(event, 'rangeSelection'));
}
