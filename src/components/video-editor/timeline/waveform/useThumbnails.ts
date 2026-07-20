import { ref, onUnmounted, reactive, watch, type Ref } from 'vue';
import ThumbnailWorker from './thumbnail.worker?worker&inline';

export function useThumbnails(videoSrcRef: Ref<string | null>) {
  const thumbnails = reactive<Record<number, string>>({});
  const isExtracting = ref(false);
  
  let worker: Worker | null = null;
  let hiddenVideo: HTMLVideoElement | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let canvasCtx: CanvasRenderingContext2D | null = null;
  let resolveSeek: (() => void) | null = null;

  // Watch videoSrcRef changes and update hiddenVideo src
  watch(videoSrcRef, (newSrc) => {
    if (hiddenVideo && newSrc) {
      hiddenVideo.src = newSrc;
      hiddenVideo.load();
    }
  });

  const initVideoAndCanvas = () => {
    if (!hiddenVideo) {
      hiddenVideo = document.createElement('video');
      console.log('[useThumbnails] Initializing hidden video element with src:', videoSrcRef.value);
      hiddenVideo.src = videoSrcRef.value || '';
      hiddenVideo.muted = true;
      hiddenVideo.playsInline = true;
      hiddenVideo.preload = 'auto';
      
      // Wait for seek completes
      hiddenVideo.addEventListener('seeked', () => {
        console.log('[useThumbnails] Hidden video seeked successfully');
        if (resolveSeek) {
          resolveSeek();
          resolveSeek = null;
        }
      });

      hiddenVideo.addEventListener('loadedmetadata', () => {
        console.log('[useThumbnails] Hidden video loadedmetadata. duration:', hiddenVideo?.duration);
      });

      hiddenVideo.addEventListener('error', (e) => {
        console.error('[useThumbnails] Hidden video error occurred:', hiddenVideo?.error);
        if (resolveSeek) {
          resolveSeek();
          resolveSeek = null;
        }
      });

      hiddenVideo.addEventListener('stalled', () => {
        console.warn('[useThumbnails] Hidden video loading stalled');
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
      console.log('[useThumbnails] Instantiating inline thumbnail worker...');
      worker = new ThumbnailWorker();

      worker.onmessage = async (event: MessageEvent) => {
        const { type, time, dataUrl } = event.data;
        console.log('[useThumbnails] Received message from worker:', type, { time, hasDataUrl: !!dataUrl });

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
                console.log('[useThumbnails] Sending frame response to worker for time:', time);
                worker?.postMessage({
                  type: 'frame-response',
                  time,
                  dataUrl: dataUrlResult
                });
              }
            }
          } catch (e) {
            console.error('[useThumbnails] Failed to extract frame at time:', time, e);
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
    console.log('[useThumbnails] Requesting visible frames from worker:', visibleTimestamps);
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
