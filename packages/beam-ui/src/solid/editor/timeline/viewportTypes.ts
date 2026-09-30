export interface RulerTick {
  timeMs: number;
  x: number;
  height: number;
  label?: string;
}
export interface TimelineBand {
  x: number;
  width: number;
  alternate: boolean;
}
