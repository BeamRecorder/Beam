export interface ExportPreview {
  readonly current: string | undefined;
  capture(source: CanvasImageSource): void;
  settle(): Promise<void>;
  dispose(): void;
}
