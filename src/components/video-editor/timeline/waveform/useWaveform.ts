import { ref, onUnmounted } from 'vue';

export function useWaveform() {
  const peaks = ref<Float32Array | null>(null);
  const progress = ref<number>(0);
  const isProcessing = ref<boolean>(false);
  const error = ref<string | null>(null);
  
  let worker: Worker | null = null;

  const terminateWorker = () => {
    if (worker) {
      worker.terminate();
      worker = null;
    }
  };

  const generateWaveform = (audioData: Float32Array, targetPoints: number = 1000) => {
    // Reset state
    terminateWorker();
    progress.value = 0;
    isProcessing.value = true;
    error.value = null;
    peaks.value = null;

    try {
      // Instantiate worker using standard Vite syntax
      worker = new Worker(
        new URL('./waveform.worker.ts', import.meta.url),
        { type: 'module' }
      );

      worker.onmessage = (event: MessageEvent) => {
        const { type, progress: prog, peaks: computedPeaks, message } = event.data;

        if (type === 'progress') {
          progress.value = prog;
          peaks.value = computedPeaks;
        } else if (type === 'done') {
          progress.value = 100;
          peaks.value = computedPeaks;
          isProcessing.value = false;
          terminateWorker();
        } else if (type === 'error') {
          error.value = message;
          isProcessing.value = false;
          terminateWorker();
        }
      };

      worker.onerror = (err) => {
        error.value = err.message || 'Worker thread execution error';
        isProcessing.value = false;
        terminateWorker();
      };

      // Post message with transferable float array for speed and memory efficiency
      worker.postMessage(
        { type: 'process', audioData, targetPoints },
        [audioData.buffer] // transfer the underlying ArrayBuffer
      );
    } catch (err: any) {
      error.value = err.message || 'Failed to initialize worker';
      isProcessing.value = false;
      terminateWorker();
    }
  };

  onUnmounted(() => {
    terminateWorker();
  });

  return {
    peaks,
    progress,
    isProcessing,
    error,
    generateWaveform,
    cancel: terminateWorker
  };
}
