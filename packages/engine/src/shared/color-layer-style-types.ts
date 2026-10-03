export type ColorLayerCornerRadius = 'none' | 'sm' | 'md' | 'lg' | number;
export type ColorLayerShadowSize = 'none' | 'sm' | 'md' | 'lg' | 'custom';
export type ColorLayerShadowMode = 'solid' | 'adaptive';
export type ColorLayerShadowDirection = 'all' | 'bottom' | 'bottom-right' | 'top-left';

export interface ColorLayerStyle {
  opacityEnabled: boolean;
  opacity: number;
  cornerRadius: ColorLayerCornerRadius;
  shadowSize: ColorLayerShadowSize;
  shadowBlur: number;
  shadowMode: ColorLayerShadowMode;
  shadowColor: string;
  shadowDirection: ColorLayerShadowDirection;
  backdropBlurEnabled: boolean;
  backdropBlur: number;
}
