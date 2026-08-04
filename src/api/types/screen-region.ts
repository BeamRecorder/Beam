export interface ScreenRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScreenRegionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScreenRegionOverlayOptions {
  bounds: ScreenRegionBounds;
  region?: ScreenRegion | null;
}
