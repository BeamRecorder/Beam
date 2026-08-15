import type { CursorType } from '../../../../api/types/cursor-presentation';

const CURSOR_TYPES = new Set<string>([
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
  'resizenorth',
  'resizenortheast',
  'resizenortheastsouthwest',
  'resizenorthsouth',
  'resizenorthwest',
  'resizenorthwestsoutheast',
  'resizeright',
  'resizesouth',
  'resizesoutheast',
  'resizesouthwest',
  'resizeup',
  'resizeupdown',
  'resizewest',
  'resizewesteast',
  'screenshotselection',
  'screenshotwindow',
  'textcursor',
  'textcursorvertical',
  'zoomin',
  'zoomout',
]);

/** `custom` is intentionally rendered as the default pointer, never guessed. */
export const cursorTypeForKind = (kind: string | null | undefined): Exclude<CursorType, 'automatic'> => {
  const candidate = kind === 'custom' ? 'default' : kind;
  return candidate && CURSOR_TYPES.has(candidate) ? (candidate as Exclude<CursorType, 'automatic'>) : 'default';
};
