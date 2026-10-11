import { resolvePublicAssetUrl } from './public-asset';

export async function playScreenshotSound(): Promise<void> {
  let sound: HTMLAudioElement | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const audio = new Audio(resolvePublicAssetUrl('sounds/screenshot-click.wav'));
    sound = audio;
    audio.volume = 1;
    // Keep the capturing renderer alive until the short click has finished.
    await new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error('Screenshot sound could not be decoded.'));
      timeout = setTimeout(() => reject(new Error('Screenshot sound playback timed out.')), 1_500);
      void audio.play().catch(reject);
    });
  } catch (error) {
    // Audio feedback must never turn a successful screenshot into a capture failure.
    console.warn('Screenshot confirmation sound could not play.', error);
  } finally {
    clearTimeout(timeout);
    if (sound) {
      sound.onended = null;
      sound.onerror = null;
      sound.pause();
      sound.removeAttribute('src');
      sound.load();
    }
  }
}
