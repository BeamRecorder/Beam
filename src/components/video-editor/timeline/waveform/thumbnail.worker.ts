// Web worker for scheduling video thumbnail extraction requests in chunks

interface FrameRequest {
  time: number;
  priority: number;
}

let pendingQueue: FrameRequest[] = [];
let processing = false;
const cachedFrames = new Map<number, string>();

console.log('[Thumbnail Worker] Script loaded and running.');

self.onmessage = (event: MessageEvent) => {
  const { type, time, visibleTimes, dataUrl } = event.data;
  console.log(`[Thumbnail Worker] Message received: type=${type}, time=${time}, visibleTimesCount=${visibleTimes?.length || 0}`);

  if (type === 'request-frames') {
    // visibleTimes is an array of timestamps we want to prioritize
    const requestedTimes: number[] = visibleTimes || [];
    
    // Filter out already cached frames
    const newRequests = requestedTimes
      .filter(t => !cachedFrames.has(t))
      .map(t => ({ time: t, priority: 1 }));

    // Rebuild queue prioritizing new requests
    pendingQueue = newRequests;
    
    triggerNext();
  } else if (type === 'frame-response') {
    // Main thread returned the decoded frame data
    if (dataUrl) {
      cachedFrames.set(time, dataUrl);
      self.postMessage({ type: 'frame-ready', time, dataUrl });
    }
    processing = false;
    triggerNext();
  } else if (type === 'clear') {
    cachedFrames.clear();
    pendingQueue = [];
    processing = false;
  }
};

function triggerNext() {
  if (processing || pendingQueue.length === 0) {
    console.log('[Thumbnail Worker] triggerNext skipped:', { processing, queueLength: pendingQueue.length });
    return;
  }

  processing = true;
  // Get the next request
  const nextRequest = pendingQueue.shift();
  if (nextRequest) {
    console.log('[Thumbnail Worker] Posting extract-frame request to main thread for time:', nextRequest.time);
    self.postMessage({ type: 'extract-frame', time: nextRequest.time });
  } else {
    processing = false;
  }
}
