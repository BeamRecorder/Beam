export interface ImmutableMediaCache<Value> {
  get(source: CanvasImageSource, key: string): Value | undefined;
  set(source: CanvasImageSource, key: string, value: Value): void;
}
