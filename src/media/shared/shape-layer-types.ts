import type { ElementText, FreehandDrawing } from './element-types';

export type ShapeLayerFamily = 'shape' | 'arrow' | 'text' | 'drawing';
export type ShapeLayerPreset =
  | 'rectangle'
  | 'rounded-rectangle'
  | 'ellipse'
  | 'triangle'
  | 'diamond'
  | 'star'
  | 'arrow'
  | 'text'
  | 'freehand';
export interface ShapeLayerStyle {
  text?: ElementText;
  drawing?: FreehandDrawing;
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
