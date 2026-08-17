import type { MediaRect } from './appearance-types';

export interface FrameOptions {
  showMenu?: boolean;
  showScrollbars?: boolean;
  chromeScale?: number;
}

export const normalizeFrameChromeScale = (value: number | undefined) =>
  Number.isFinite(value) ? Math.min(2, Math.max(0.5, value ?? 1)) : 1;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export interface SafariFrameGeometry {
  content: MediaRect;
  header: number;
  unit: number;
  detail: 'compact' | 'medium' | 'full';
  showText: boolean;
  radius: number;
}

export function resolveSafariFrameGeometry(rect: MediaRect, chromeScale?: number): SafariFrameGeometry {
  const scale = normalizeFrameChromeScale(chromeScale);
  const naturalUnit = Math.min(rect.width / 1800, rect.height / 1150) * scale;
  const maxHeader = Math.max(1, Math.min(96, rect.height * 0.34, rect.height - 1));
  const header = clamp(68 * naturalUnit, Math.min(14, maxHeader), maxHeader);
  const unit = header / 68;
  const availableUnits = rect.width / Math.max(0.01, unit);
  const detail = availableUnits >= 1400 ? 'full' : availableUnits >= 720 ? 'medium' : 'compact';
  const border = Math.min(Math.max(0.5, unit), Math.max(0, (rect.width - 1) / 2));
  return {
    header,
    unit,
    detail,
    showText: rect.width >= 72 && header >= 10,
    radius: Math.min(Math.max(4, 18 * unit), rect.width / 2, rect.height / 2),
    content: {
      x: rect.x + border,
      y: rect.y + header,
      width: Math.max(0, rect.width - border * 2),
      height: Math.max(0, rect.height - header - border),
    },
  };
}

export interface WindowsFrameGeometry {
  content: MediaRect;
  unit: number;
  outerInset: number;
  titleHeight: number;
  menuHeight: number;
  scrollbarSize: number;
  showMenu: boolean;
  showScrollbars: boolean;
  detail: 'compact' | 'full';
  showText: boolean;
}

export function resolveWindowsFrameGeometry(rect: MediaRect, options: FrameOptions = {}): WindowsFrameGeometry {
  const scale = normalizeFrameChromeScale(options.chromeScale);
  const naturalUnit = Math.min(rect.width / 800, rect.height / 520) * scale;
  const maxTitle = Math.max(1, Math.min(42, rect.height * 0.28, rect.height - 1));
  const titleHeight = clamp(31 * naturalUnit, Math.min(14, maxTitle), maxTitle);
  const unit = titleHeight / 31;
  const outerInset = clamp(3 * unit, 1, 5);
  const requestedMenuHeight = clamp(34 * unit, 10, 28);
  const showMenu = options.showMenu !== false && rect.height >= titleHeight + requestedMenuHeight + 18;
  const menuHeight = showMenu ? requestedMenuHeight : 0;
  const requestedScrollbar = clamp(18 * unit, 7, 20);
  const showScrollbars =
    options.showScrollbars !== false &&
    rect.width >= Math.max(120, requestedScrollbar * 8) &&
    rect.height >= Math.max(64, titleHeight + menuHeight + requestedScrollbar * 4);
  const scrollbarSize = showScrollbars ? requestedScrollbar : 0;
  const bevel = Math.max(1, 2 * unit);
  const left = Math.min(rect.width, outerInset + bevel);
  const top = Math.min(rect.height, outerInset + titleHeight + menuHeight + bevel);
  const right = Math.min(Math.max(0, rect.width - left), outerInset + bevel + scrollbarSize);
  const bottom = Math.min(Math.max(0, rect.height - top), outerInset + bevel + scrollbarSize);
  return {
    unit,
    outerInset,
    titleHeight,
    menuHeight,
    scrollbarSize,
    showMenu,
    showScrollbars,
    detail: rect.width / Math.max(0.01, unit) >= 360 ? 'full' : 'compact',
    showText: rect.width >= 72 && titleHeight >= 10,
    content: {
      x: rect.x + left,
      y: rect.y + top,
      width: Math.max(0, rect.width - left - right),
      height: Math.max(0, rect.height - top - bottom),
    },
  };
}
