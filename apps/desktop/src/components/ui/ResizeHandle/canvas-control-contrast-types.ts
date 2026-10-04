export type CanvasControlTone = 'light' | 'dark';
export interface CanvasControlPixels {
  width: number;
  height: number;
  data: ArrayLike<number>;
}
export interface CanvasControlContrast {
  register: (element: HTMLElement | SVGElement) => () => void;
  refresh: () => void;
  dispose: () => void;
}
