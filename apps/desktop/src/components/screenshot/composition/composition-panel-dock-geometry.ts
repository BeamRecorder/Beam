import type { CompositionPanelBounds, CompositionPanelPosition, CompositionPanelRect } from './composition-panel-types';
import { compositionPanelLayout } from './composition-panel-position';

export function overCompositionDock(x: number, y: number, target: CompositionPanelRect | null): boolean {
  return Boolean(
    target &&
    target.width > 0 &&
    target.height > 0 &&
    x >= target.left &&
    x <= target.left + target.width &&
    y >= target.top &&
    y <= target.top + target.height + 12,
  );
}

export function compositionPositionAt(bounds: CompositionPanelBounds, x: number, y: number): CompositionPanelPosition {
  const layout = compositionPanelLayout(bounds, { x: 0, y: 0 });
  const fraction = (value: number) => Math.max(0, Math.min(1, value));
  return {
    x: layout.travelX ? fraction((x - layout.x) / layout.travelX) : 0,
    y: layout.travelY ? fraction((y - layout.y) / layout.travelY) : 0,
  };
}
