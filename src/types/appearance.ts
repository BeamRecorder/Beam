export type ThemeMode = 'light' | 'dark' | 'system';
export type SurfaceTone = 'default' | 'neutral' | 'slate' | 'deep';
export type UiScalePercent = 50 | 75 | 100 | 125;
export type UiScaleRegion = 'topbar' | 'sidebar' | 'properties' | 'canvasControls' | 'timeline';

export interface UiScaleSettings {
  global: UiScalePercent;
  overrides: Record<UiScaleRegion, UiScalePercent | null>;
}

export interface ThemePreset {
  id: string;
  name: string;
  nameFr: string;
  primaryColor: string;
  secondaryColor: string;
  radiusPx: number;
  isPillRadius?: boolean;
  surfaceTone: SurfaceTone;
}

export interface AppearanceSettings {
  theme: ThemeMode;
  primaryColor: string;
  secondaryColor: string;
  radiusPx: number;
  isPillRadius: boolean;
  surfaceTone: SurfaceTone;
  activePresetId?: string | null;
  uiScale?: UiScaleSettings;
}

export interface ColorSwatch {
  id: string;
  label: string;
  color: string;
}

export interface RadiusPresetOption {
  id: string;
  label: string;
  radiusPx: number;
  isCustom?: boolean;
}

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  theme: 'light',
  primaryColor: '#ff5a1f',
  secondaryColor: '#6366f1',
  radiusPx: 10,
  isPillRadius: false,
  surfaceTone: 'default',
  activePresetId: 'beam-sunset',
  uiScale: {
    global: 100,
    overrides: {
      topbar: null,
      sidebar: null,
      properties: null,
      canvasControls: null,
      timeline: null,
    },
  },
};

export const UI_SCALE_PRESETS: UiScalePercent[] = [50, 75, 100, 125];

export const COLOR_PRESETS: ColorSwatch[] = [
  { id: 'beam-orange', label: 'Beam Sunset', color: '#ff5a1f' },
  { id: 'electric-indigo', label: 'Indigo', color: '#6366f1' },
  { id: 'emerald-green', label: 'Emerald', color: '#10b981' },
  { id: 'crimson-rose', label: 'Crimson', color: '#f43f5e' },
  { id: 'violet-purple', label: 'Violet', color: '#8b5cf6' },
  { id: 'ocean-cyan', label: 'Cyan', color: '#06b6d4' },
  { id: 'amber-gold', label: 'Amber', color: '#f59e0b' },
  { id: 'sky-blue', label: 'Sky Blue', color: '#0284c7' },
  { id: 'pink-sakura', label: 'Sakura Pink', color: '#ec4899' },
  { id: 'slate-gray', label: 'Slate', color: '#64748b' },
];

export const SECONDARY_COLOR_PRESETS: ColorSwatch[] = [
  { id: 'sec-indigo', label: 'Indigo', color: '#6366f1' },
  { id: 'sec-orange', label: 'Orange', color: '#ff5a1f' },
  { id: 'sec-emerald', label: 'Emerald', color: '#10b981' },
  { id: 'sec-cyan', label: 'Cyan', color: '#06b6d4' },
  { id: 'sec-violet', label: 'Violet', color: '#a855f7' },
  { id: 'sec-amber', label: 'Amber', color: '#f59e0b' },
  { id: 'sec-teal', label: 'Teal', color: '#14b8a6' },
  { id: 'sec-slate', label: 'Slate', color: '#94a3b8' },
];

export const RADIUS_PRESETS: RadiusPresetOption[] = [
  { id: 'sharp', label: '0px', radiusPx: 0 },
  { id: 'compact', label: '6px', radiusPx: 6 },
  { id: 'default', label: '10px', radiusPx: 10 },
  { id: 'rounded', label: '16px', radiusPx: 16 },
  { id: 'extra', label: '24px', radiusPx: 24 },
  { id: 'custom', label: 'Custom', radiusPx: 10, isCustom: true },
];

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'beam-sunset',
    name: 'Beam Sunset',
    nameFr: 'Coucher de soleil Beam',
    primaryColor: '#ff5a1f',
    secondaryColor: '#6366f1',
    radiusPx: 10,
    isPillRadius: false,
    surfaceTone: 'default',
  },
  {
    id: 'cyber-violet',
    name: 'Cyber Violet',
    nameFr: 'Cyber Violet',
    primaryColor: '#8b5cf6',
    secondaryColor: '#06b6d4',
    radiusPx: 12,
    isPillRadius: false,
    surfaceTone: 'slate',
  },
  {
    id: 'emerald-forest',
    name: 'Emerald Forest',
    nameFr: 'Forêt Émeraude',
    primaryColor: '#10b981',
    secondaryColor: '#f59e0b',
    radiusPx: 8,
    isPillRadius: false,
    surfaceTone: 'neutral',
  },
  {
    id: 'crimson-velvet',
    name: 'Crimson Velvet',
    nameFr: 'Velours Cramoisi',
    primaryColor: '#f43f5e',
    secondaryColor: '#a855f7',
    radiusPx: 14,
    isPillRadius: false,
    surfaceTone: 'deep',
  },
  {
    id: 'oceanic-breeze',
    name: 'Oceanic Breeze',
    nameFr: 'Brise Océanique',
    primaryColor: '#0284c7',
    secondaryColor: '#14b8a6',
    radiusPx: 10,
    isPillRadius: false,
    surfaceTone: 'slate',
  },
  {
    id: 'amber-studio',
    name: 'Amber Studio',
    nameFr: 'Studio Ambre',
    primaryColor: '#f59e0b',
    secondaryColor: '#ec4899',
    radiusPx: 4,
    isPillRadius: false,
    surfaceTone: 'neutral',
  },
  {
    id: 'sakura-bloom',
    name: 'Sakura Bloom',
    nameFr: 'Floraison Sakura',
    primaryColor: '#ec4899',
    secondaryColor: '#8b5cf6',
    radiusPx: 18,
    isPillRadius: false,
    surfaceTone: 'default',
  },
  {
    id: 'slate-precision',
    name: 'Slate Precision',
    nameFr: 'Précision Ardoise',
    primaryColor: '#0ea5e9',
    secondaryColor: '#64748b',
    radiusPx: 2,
    isPillRadius: false,
    surfaceTone: 'slate',
  },
];

export interface SurfaceToneStyle {
  light: {
    bgApp: string;
    bgSurface: string;
    bgSurfaceHover: string;
    bgElement: string;
    border: string;
    borderStrong: string;
  };
  dark: {
    bgApp: string;
    bgSurface: string;
    bgSurfaceHover: string;
    bgElement: string;
    border: string;
    borderStrong: string;
  };
}

export const SURFACE_TONES: Record<SurfaceTone, SurfaceToneStyle> = {
  default: {
    light: {
      bgApp: '#f7f5f0',
      bgSurface: '#f7f5f0',
      bgSurfaceHover: '#ebe8e0',
      bgElement: '#ffffff',
      border: '#e6e3dc',
      borderStrong: '#d3cfc5',
    },
    dark: {
      bgApp: '#141310',
      bgSurface: '#161512',
      bgSurfaceHover: '#262420',
      bgElement: '#201f1c',
      border: '#2e2c28',
      borderStrong: '#3d3a34',
    },
  },
  neutral: {
    light: {
      bgApp: '#f4f4f5',
      bgSurface: '#f4f4f5',
      bgSurfaceHover: '#e4e4e7',
      bgElement: '#ffffff',
      border: '#e4e4e7',
      borderStrong: '#d4d4d8',
    },
    dark: {
      bgApp: '#121214',
      bgSurface: '#18181b',
      bgSurfaceHover: '#27272a',
      bgElement: '#222226',
      border: '#27272a',
      borderStrong: '#3f3f46',
    },
  },
  slate: {
    light: {
      bgApp: '#f1f5f9',
      bgSurface: '#f1f5f9',
      bgSurfaceHover: '#e2e8f0',
      bgElement: '#ffffff',
      border: '#e2e8f0',
      borderStrong: '#cbd5e1',
    },
    dark: {
      bgApp: '#0b1120',
      bgSurface: '#0f172a',
      bgSurfaceHover: '#1e293b',
      bgElement: '#1a2236',
      border: '#1e293b',
      borderStrong: '#334155',
    },
  },
  deep: {
    light: {
      bgApp: '#fafafa',
      bgSurface: '#fafafa',
      bgSurfaceHover: '#f0f0f0',
      bgElement: '#ffffff',
      border: '#eaeaea',
      borderStrong: '#dcdcdc',
    },
    dark: {
      bgApp: '#080808',
      bgSurface: '#0d0d0d',
      bgSurfaceHover: '#1c1c1c',
      bgElement: '#171717',
      border: '#1f1f1f',
      borderStrong: '#2e2e2e',
    },
  },
};

/**
 * Adjust hex color lightness (positive percent lightens, negative percent darkens)
 */
export function adjustHexBrightness(hex: string, percent: number): string {
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length !== 6) return hex;

  const num = parseInt(cleanHex, 16);
  let r = (num >> 16) + Math.round(255 * (percent / 100));
  let g = ((num >> 8) & 0x00ff) + Math.round(255 * (percent / 100));
  let b = (num & 0x0000ff) + Math.round(255 * (percent / 100));

  r = Math.min(255, Math.max(0, r));
  g = Math.min(255, Math.max(0, g));
  b = Math.min(255, Math.max(0, b));

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/**
 * Convert hex to rgba
 */
export function hexToRgba(hex: string, alpha: number): string {
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length !== 6) return `rgba(255, 90, 31, ${alpha})`;

  const num = parseInt(cleanHex, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
