export interface BlickWaveformData {
  bars: readonly number[];
  bands: Float32Array;
  sourceDurationSeconds: number;
  loadingSegments: readonly { leftPercent: number; widthPercent: number }[];
}

export interface BlickWaveformRenderer {
  draw: (target: HTMLCanvasElement | OffscreenCanvas, data: BlickWaveformData, width: number, height: number) => void;
  dispose: () => void;
}

export interface BlickWaveformPresentation {
  leftPercent: number;
  widthPercent: number;
  loadingSegments: BlickWaveformData['loadingSegments'];
}

export interface BlickWaveformCanvasProps extends BlickWaveformData {
  deferDraw?: boolean;
  leftPercent?: number;
  widthPercent?: number;
}

export interface BlickWaveformRendererOptions {
  createCanvas: () => HTMLCanvasElement | OffscreenCanvas;
  pixelRatio: () => number;
}

export interface BlickWaveformWorkerRequest {
  id: number;
  data: BlickWaveformData;
  width: number;
  height: number;
  pixelRatio: number;
}

export type BlickWaveformWorkerReply = { id: number; bitmap: ImageBitmap } | { id: number; error: string };

export interface BlickWaveformWorkerRenderer {
  draw: (target: HTMLCanvasElement, data: BlickWaveformData, width: number, height: number) => Promise<boolean>;
  dispose: () => void;
}
