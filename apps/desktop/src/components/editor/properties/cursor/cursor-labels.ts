import type { CursorAssetDescriptor, CursorPackDescriptor } from '@beam/engine/capture/cursor-pack';
const resizeDirections: Record<string, string> = {
  resizenorth: 'north',
  resizeup: 'north',
  resizenortheast: 'northeast',
  resizeright: 'east',
  resizesoutheast: 'southeast',
  resizesouth: 'south',
  resizesouthwest: 'southwest',
  resizewest: 'west',
  resizenorthwest: 'northwest',
  resizenorthsouth: 'vertical',
  resizeupdown: 'vertical',
  resizewesteast: 'horizontal',
  resizenortheastsouthwest: 'diagonalUp',
  resizenorthwestsoutheast: 'diagonalDown',
};
const roles = new Set([
  'default',
  'beachball',
  'busy',
  'cell',
  'contextualmenu',
  'copy',
  'cross',
  'handgrabbing',
  'handopen',
  'handpointing',
  'help',
  'makealias',
  'move',
  'notallowed',
  'poof',
  'textcursor',
  'textcursorvertical',
  'screenshotselection',
  'screenshotwindow',
  'zoomin',
  'zoomout',
]);
export function localizedCursorLabel(
  pack: CursorPackDescriptor,
  asset: CursorAssetDescriptor,
  translate: (key: string, params?: Record<string, string>) => string,
): string {
  if (pack.source !== 'builtin') return asset.label;
  const role = Object.entries(pack.automaticMap).find(([, id]) => id === asset.id)?.[0] ?? asset.id;
  const direction = resizeDirections[role];
  if (direction) return translate('cursorResize', { direction: translate(`cursorDirections.${direction}`) });
  return roles.has(role) ? translate(`cursorLabels.${role}`) : asset.label;
}
