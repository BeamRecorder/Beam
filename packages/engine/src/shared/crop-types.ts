export interface CropDimensions {
  width: number;
  height: number;
}
export type CropEdge = 'top' | 'right' | 'bottom' | 'left';
export interface CropPixels extends CropDimensions {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
