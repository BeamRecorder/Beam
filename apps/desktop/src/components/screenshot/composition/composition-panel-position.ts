import type {
  CompositionPanelBounds,
  CompositionPanelLayout,
  CompositionPanelPosition,
} from './composition-panel-types';

export const COMPOSITION_POSITION_KEY = 'screenshotCompositionPosition';
export const MAX_COMPOSITION_BODY_HEIGHT = 360;
export const DEFAULT_COMPOSITION_POSITION: CompositionPanelPosition = {
  x: 1,
  y: 0,
};
const INSET = 16;
const fraction = (value: number) => Math.max(0, Math.min(1, value));

export function readCompositionPanelPosition(value: unknown): CompositionPanelPosition | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (!('x' in value) || !('y' in value)) return null;
  const { x, y } = value;
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}

export function compositionPanelLayout(
  bounds: CompositionPanelBounds,
  position: CompositionPanelPosition,
  contentHeight = 0,
  preferredUpward = false,
): CompositionPanelLayout {
  const spareX = Math.max(0, bounds.width - bounds.panelWidth);
  const spareY = Math.max(0, bounds.height - bounds.headerHeight);
  const insetX = Math.min(INSET, spareX / 2);
  const insetY = Math.min(INSET, spareY / 2);
  const travelX = Math.max(0, spareX - insetX * 2);
  const travelY = Math.max(0, spareY - insetY * 2);
  const x = insetX + fraction(position.x) * travelX;
  const y = insetY + fraction(position.y) * travelY;
  const above = y - insetY;
  const below = spareY - insetY - y;
  const preferredSpace = preferredUpward ? above : below;
  const otherSpace = preferredUpward ? below : above;
  // Keep the current direction while the content fits, even past the workspace midpoint.
  // If neither side fits, a small dead band prevents repeated flips from pointer jitter.
  const moreRoom = otherSpace >= contentHeight ? otherSpace > preferredSpace : otherSpace - preferredSpace > 8;
  const upward = preferredSpace < contentHeight && moreRoom ? !preferredUpward : preferredUpward;
  return {
    x,
    y,
    travelX,
    travelY,
    upward,
    bodyHeight: upward ? above : below,
  };
}

export function moveCompositionPanel(
  position: CompositionPanelPosition,
  layout: CompositionPanelLayout,
  dx: number,
  dy: number,
): CompositionPanelPosition {
  return {
    x: layout.travelX ? fraction(position.x + dx / layout.travelX) : position.x,
    y: layout.travelY ? fraction(position.y + dy / layout.travelY) : position.y,
  };
}

export function clampCompositionPanelPosition(
  bounds: CompositionPanelBounds,
  position: CompositionPanelPosition,
  bodyHeight: number,
  upward: boolean,
): CompositionPanelPosition {
  const { travelY } = compositionPanelLayout(bounds, position);
  const occupied = travelY ? Math.min(1, Math.max(0, bodyHeight) / travelY) : 0;
  return {
    x: fraction(position.x),
    y: Math.max(upward ? occupied : 0, Math.min(upward ? 1 : 1 - occupied, position.y)),
  };
}
