export type CaptionShapePreset = 'square' | 'rounded' | 'pill' | 'custom';

export interface CaptionShapeStyle {
  preset: CaptionShapePreset;
  /** Corner radius as a percentage of the maximum radius for the shape bounds. */
  radius: number;
  color: string;
  opacity: number;
  blur: number;
  /** Padding on every side as a percentage of the caption font size. */
  padding: number;
}
