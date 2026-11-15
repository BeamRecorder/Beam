/** Host-neutral structural controls used by the upstream math; no renderer enters the engine. */
export interface Container {
  scale: { set(value: number): void };
  position: { set(x: number, y: number): void };
}
export interface MotionBlurFilter {
  velocity: { x: number; y: number };
  kernelSize: number;
  offset: number;
}
export interface ZoomBlurFilter {
  center: { x: number; y: number };
  strength: number;
  innerRadius: number;
  radius: number;
}
