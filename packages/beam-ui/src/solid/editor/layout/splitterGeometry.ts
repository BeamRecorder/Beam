import type { SplitterGeometry } from './layoutTypes';

/** Keep the visible separator and its larger pointer target in one orientation model. */
export function splitterGeometry(vertical = false, hairline = false): SplitterGeometry {
  if (vertical) return {
    width: hairline ? 1 : 8, height: '100%', pillWidth: 3, pillHeight: 32,
    hitWidth: hairline ? 7 : 12, hitHeight: '100%', inset: { start: hairline ? -3 : -2, top: 0 },
    orientation: 'vertical', cursor: 'ewResize',
  };
  return {
    width: '100%', height: 8, pillWidth: 32, pillHeight: 3,
    hitWidth: '100%', hitHeight: 12, inset: { start: 0, top: -2 },
    orientation: 'horizontal', cursor: 'nsResize',
  };
}
