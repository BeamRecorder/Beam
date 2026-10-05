export const MEDIA_OPERATION_TIMEOUT_MS = 15_000;

export async function withMediaDeadline<T>(
  operation: Promise<T>,
  description: string,
  timeoutMs = MEDIA_OPERATION_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${description} timed out.`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function stopBrowserMediaRecorder(recorder: MediaRecorder, description: string): Promise<void> {
  if (recorder.state === 'inactive') return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const complete = (error?: unknown) => {
      clearTimeout(timer);
      recorder.removeEventListener('stop', stopped);
      recorder.removeEventListener('error', failed);
      if (error) reject(error);
      else resolve();
    };
    const stopped = () => complete();
    const failed = () => complete(new Error(`${description} failed.`));
    const timer = setTimeout(() => complete(new Error(`${description} timed out.`)), MEDIA_OPERATION_TIMEOUT_MS);
    recorder.addEventListener('stop', stopped);
    recorder.addEventListener('error', failed);
    try {
      recorder.stop();
    } catch (error) {
      complete(error);
    }
  });
}
