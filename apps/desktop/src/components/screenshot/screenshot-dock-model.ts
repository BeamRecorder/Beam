import type { ScreenshotDockToolId } from './screenshot-dock-types';

export const SCREENSHOT_DOCK_KEY = 'screenshotDockTools';
const allowed: readonly ScreenshotDockToolId[] = [
  'arrow',
  'text',
  'shape',
  'drawing',
  'image',
  'highlight',
  'blur',
  'zoom',
  'cursor',
  'canvas',
  'group',
  'ungroup',
];
export const DEFAULT_DOCK_TOOLS: readonly ScreenshotDockToolId[] = [
  'arrow',
  'text',
  'shape',
  'drawing',
  'image',
  'canvas',
];
export const isDockTool = (value: unknown): value is ScreenshotDockToolId =>
  typeof value === 'string' && allowed.some((id) => id === value);
export function readDockTools(value: unknown): ScreenshotDockToolId[] {
  return Array.isArray(value) ? [...new Set(value.slice(0, 64).filter(isDockTool))] : [...DEFAULT_DOCK_TOOLS];
}

/** The insertion boundary refers to the original row, before removing the dragged tool. */
export function reorderDockTool(tools: readonly ScreenshotDockToolId[], id: ScreenshotDockToolId, boundary: number) {
  const from = tools.indexOf(id);
  if (from < 0 || !Number.isFinite(boundary)) return null;
  const slot = Math.max(0, Math.min(tools.length, Math.trunc(boundary)));
  const to = slot > from ? slot - 1 : slot;
  if (to === from) return null;
  const next = tools.filter((tool) => tool !== id);
  next.splice(to, 0, id);
  return next;
}
