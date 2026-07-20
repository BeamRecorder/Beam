import { ref, onUnmounted, reactive } from 'vue';

export function useThumbnails(videoSrc: string) {
  const thumbnails = reactive<Record<number, string>>({});
  const isExtracting = ref(false);
  
  let worker: Worker | null = null;
  let hiddenVideo: HTMLVideoElement | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let canvasCtx: CanvasRenderingContext2D | null = null;
  let resolveSeek: (() => void) | null = null;

  const initVideoAndCanvas = () => {
    if (!hiddenVideo) {
      hiddenVideo = document.createElement('video');
      hiddenVideo.src = videoSrc;
      hiddenVideo.muted = true;
      hiddenVideo.playsInline = true;
      hiddenVideo.preload = 'auto';
      
      // Wait for seek completes
      hiddenVideo.addEventListener('seeked', () => {
        if (resolveSeek) {
          resolveSeek();
          resolveSeek = null;
        }
      });
    }

    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width = 120; // low resolution thumbnails for fast performance
      canvas.height = 68; // 16:9 aspect ratio roughly
      canvasCtx = canvas.getContext('2d');
    }
  };

  const initWorker = () => {
    if (!worker) {
      worker = new Worker(
        new URL('./thumbnail.worker.ts', import.meta.url),
        { type: 'module' }
      );

      worker.onmessage = async (event: MessageEvent) => {
        const { type, time, dataUrl } = event.data;

        if (type === 'extract-frame') {
          if (!hiddenVideo || !canvas || !canvasCtx) {
            initVideoAndCanvas();
          }

          try {
            isExtracting.value = true;
            // Seek video to target time
            if (hiddenVideo) {
              hiddenVideo.currentTime = time;
              
              // Promise to wait for seek complete
              await new Promise<void>((resolve) => {
                resolveSeek = resolve;
              });

              // Draw frame to low-res canvas
              if (canvas) {
                canvasCtx?.drawImage(hiddenVideo, 0, 0, canvas.width, canvas.height);
                const dataUrlResult = canvas.toDataURL('image/jpeg', 0.6); // low quality for performance
                
                // Return to worker
                worker?.postMessage({
                  type: 'frame-response',
                  time,
                  dataUrl: dataUrlResult
                });
              }
            }
          } catch (e) {
            console.error('Failed to extract frame at time:', time, e);
            worker?.postMessage({
              type: 'frame-response',
              time,
              dataUrl: null
            });
          } finally {
            isExtracting.value = false;
          }
        } else if (type === 'frame-ready') {
          thumbnails[time] = dataUrl;
        }
      };
    }
  };

  // Request frames based on virtualized scroll viewport
  const requestVisibleFrames = (visibleTimestamps: number[]) => {
    initWorker();
    worker?.postMessage({
      type: 'request-frames',
      visibleTimes: visibleTimestamps
    });
  };

  const clearCache = () => {
    worker?.postMessage({ type: 'clear' });
    Object.keys(thumbnails).forEach(key => {
      delete thumbnails[Number(key)];
    });
  };

  onUnmounted(() => {
    if (worker) {
      worker.terminate();
    }
    if (hiddenVideo) {
      hiddenVideo.remove();
    }
  });

  return {
    thumbnails,
    isExtracting,
    requestVisibleFrames,
    clearCache
  };
}
