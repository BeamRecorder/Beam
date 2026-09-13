export interface BlickWaveformData {
  bars: readonly number[];
  bands: Float32Array;
  sourceDurationSeconds: number;
  loadingSegments: readonly { leftPercent: number; widthPercent: number }[];
}

export interface BlickWaveformRenderer {
  draw: (target: HTMLCanvasElement, data: BlickWaveformData, width: number, height: number) => void;
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
