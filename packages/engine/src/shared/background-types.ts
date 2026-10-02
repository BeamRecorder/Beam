import type { ColorGradient, ColorGradientStop } from '@beam/engine/shared/color-fill-types';

export type BackgroundKind = 'image' | 'video' | 'color' | 'gradient';
export type BackgroundMediaKind = Extract<BackgroundKind, 'image' | 'video'>;

export type GradientStop = ColorGradientStop;
export type GradientBackground = ColorGradient;
export interface BackgroundMedia {
  id: string;
  name: string;
  path: string;
  extension: string;
  kind: BackgroundMediaKind;
  fileName?: string;
}
export interface ColorBackground {
  id: string;
  name: string;
  kind: 'color';
  color: string;
}
export interface GradientCatalogBackground {
  id: string;
  name: string;
  kind: 'gradient';
  gradient: GradientBackground;
}
export type BackgroundEntry = BackgroundMedia | ColorBackground | GradientCatalogBackground;
export type BackgroundValue = BackgroundMedia | ColorBackground | GradientCatalogBackground;
export interface BackgroundMediaGroup {
  kind: BackgroundMediaKind;
  label: string;
  items: BackgroundMedia[];
}
