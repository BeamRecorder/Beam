export interface TimelineInterval<T> {
  start: number;
  end: number;
  value: T;
}

export interface TimelineIntervalNode<T> extends TimelineInterval<T> {
  maximumEnd: number;
}
