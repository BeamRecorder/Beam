export interface RenderableMedia {
  source: CanvasImageSource;
  width: number;
  height: number;
  preRendered?: boolean;
}
export type CompositionVisuals = ReadonlyMap<string, RenderableMedia>;

export interface MediaRenderCamera {
  scale: number;
  focusX: number;
  focusY: number;
}
