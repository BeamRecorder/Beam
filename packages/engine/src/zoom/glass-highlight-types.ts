/** A closed contour in lens-local coordinates, independent of viewport resolution. */
export interface GlassPoint {
  x: number;
  y: number;
}

export interface GlassHighlightSettings {
  shape: 'circle' | 'freehand';
  /** Diameter as a fraction of the shorter canvas side. */
  size: number;
  /** Empty means the freehand contour has not been drawn yet. */
  path: GlassPoint[];
  refraction: number;
  bevel: number;
  rim: number;
  dispersion: number;
  shadow: number;
  opacity: number;
  /** Fade at both ends, constrained to half the clip duration. */
  transitionMs: number;
}

export interface GlassHighlightSample {
  id: string;
  center: GlassPoint;
  radius: number;
  magnification: number;
  strength: number;
  settings: GlassHighlightSettings;
}
