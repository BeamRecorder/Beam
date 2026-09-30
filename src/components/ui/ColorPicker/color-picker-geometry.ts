import type { PickerPoint } from './color-picker-types';

export function readPickerPoint(event: MouseEvent | TouchEvent, element: HTMLElement | null): PickerPoint | null {
  if (!element) return null;
  const pointer = 'touches' in event ? event.touches[0] : event;
  if (!pointer) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    x: pointer.clientX - rect.left,
    y: pointer.clientY - rect.top,
    width: rect.width,
    height: rect.height,
  };
}
