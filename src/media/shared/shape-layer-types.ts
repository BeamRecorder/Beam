export type ShapeLayerFamily = 'shape' | 'arrow';
export type ShapeLayerPreset =
  | 'rectangle'
  | 'rounded-rectangle'
  | 'ellipse'
  | 'triangle'
  | 'diamond'
  | 'star'
  | 'arrow';
export interface ShapeLayerStyle {
  family: ShapeLayerFamily;
  preset: ShapeLayerPreset;
  fillColor: string;
  borderColor: string;
  borderWidth: number;
  cornerRadius: number;
  arrowThickness: number;
  arrowHeadSize: number;
  rotation: number;
  opacityEnabled: boolean;
  opacity: number;
  backdropBlur: number;
  shadowEnabled: boolean;
  shadowColor: string;
  shadowBlur: number;
  shadowDirection: 'all' | 'bottom' | 'bottom-right' | 'top-left';
}
