import type { DitheringRecipe } from '@beam/engine/gradient/dithering-effect-types';
export interface CpuEffectRequest {
  source: ImageBitmap;
  recipe: DitheringRecipe;
  pixelRatio: number;
}
export type CpuEffectReply = { bitmap: ImageBitmap; error?: never } | { error: string; bitmap?: never };
export interface CpuEffectWorker {
  onmessage: ((event: MessageEvent<CpuEffectReply>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: CpuEffectRequest, transfer: Transferable[]): void;
  terminate(): void;
}
export interface CpuEffectSession {
  cursor: number;
  results: ImageBitmap[];
  worker?: CpuEffectWorker;
  cancelled: boolean;
  reject?: (reason: unknown) => void;
}
