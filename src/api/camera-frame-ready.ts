type FrameReadyOptions = { signal?: AbortSignal; timeoutMs?: number };

const namedError = (name: string, message: string) => Object.assign(new Error(message), { name });

export function waitForFirstCameraFrame(video: HTMLVideoElement, options: FrameReadyOptions = {}): Promise<void> {
  const { signal, timeoutMs = 5_000 } = options;
  return new Promise((resolve, reject) => {
    let settled = false;
    let frameCallbackId: number | null = null;
    const finish = (reason?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
      video.removeEventListener('error', onError);
      video.removeEventListener('loadeddata', onLoadedData);
      if (frameCallbackId !== null && typeof video.cancelVideoFrameCallback === 'function')
        video.cancelVideoFrameCallback(frameCallbackId);
      if (reason) reject(reason);
      else resolve();
    };
    const hasDimensions = (width = video.videoWidth, height = video.videoHeight) => width > 0 && height > 0;
    const onAbort = () => finish(namedError('AbortError', 'Camera frame wait was cancelled.'));
    const onError = () => finish(namedError('NotReadableError', 'The selected camera failed before its first frame.'));
    const onLoadedData = () => {
      if (hasDimensions()) finish();
    };
    const timeout = window.setTimeout(
      () => finish(namedError('NotReadableError', 'The selected camera did not produce a video frame.')),
      timeoutMs,
    );

    if (signal?.aborted) return onAbort();
    signal?.addEventListener('abort', onAbort, { once: true });
    video.addEventListener('error', onError, { once: true });
    if (typeof video.requestVideoFrameCallback === 'function') {
      frameCallbackId = video.requestVideoFrameCallback((_now, metadata) => {
        if (hasDimensions(metadata.width, metadata.height)) finish();
        else onError();
      });
    } else {
      video.addEventListener('loadeddata', onLoadedData);
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && hasDimensions()) finish();
    }
  });
}
