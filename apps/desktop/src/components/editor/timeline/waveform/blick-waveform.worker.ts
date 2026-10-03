import { acquireBlickWaveformRenderer } from './blick-waveform-renderer';
import type { BlickWaveformWorkerRequest, BlickWaveformWorkerReply } from './blick-waveform-types';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const target = new OffscreenCanvas(1, 1);
let pixelRatio = 1;
// One GPU context serves all clips; compilation and readback stay off the UI thread.
const rendererOptions = {
  createCanvas: () => new OffscreenCanvas(1, 1),
  pixelRatio: () => pixelRatio,
};
let renderer: ReturnType<typeof acquireBlickWaveformRenderer> | undefined;
scope.onmessage = ({ data: request }: MessageEvent<BlickWaveformWorkerRequest>) => {
  try {
    pixelRatio = request.pixelRatio;
    renderer ??= acquireBlickWaveformRenderer(rendererOptions);
    renderer.draw(target, request.data, request.width, request.height);
    const bitmap = target.transferToImageBitmap();
    scope.postMessage({ id: request.id, bitmap } satisfies BlickWaveformWorkerReply, [bitmap]);
  } catch (cause) {
    scope.postMessage({
      id: request.id,
      error: cause instanceof Error ? cause.message : 'The audio waveform could not be rendered.',
    } satisfies BlickWaveformWorkerReply);
  }
};
