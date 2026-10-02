import type { AudioFrameWriter, VideoFrameWriter } from '@beam/encoder/mediabunny/video-pipeline-types';
import type { ExperimentalGpuExportApi } from './experimental-export-types';

const presentCanvas = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

export function createGpuExportWriter(
  api: ExperimentalGpuExportApi,
  present = presentCanvas,
  onPresentation?: (elapsedMs: number) => void,
): VideoFrameWriter & AudioFrameWriter {
  let sequence = 0;
  let prepared = false;
  let videoClosed = false;
  let audioClosed = false;
  return {
    async prepareVideo(frame) {
      if (videoClosed || prepared || frame !== sequence) throw new Error('Invalid GPU export frame preparation.');
      await api.prepareFrame(frame);
      prepared = true;
    },
    async addVideo() {
      if (videoClosed || !prepared) throw new Error('GPU export frame is not prepared.');
      // The offscreen capturer is paused while the canvas changes. Resume it only
      // after Chromium has composited this frame; never request a CPU bitmap.
      const started = performance.now();
      await present();
      onPresentation?.(performance.now() - started);
      await api.frame(sequence);
      sequence += 1;
      prepared = false;
    },
    closeVideo() {
      videoClosed = true;
    },
    async addAudio(sample) {
      try {
        if (audioClosed) throw new Error('GPU export audio is closed.');
        if (sample.sampleRate !== 48_000 || sample.numberOfChannels !== 2)
          throw new Error('Experimental audio must be 48 kHz stereo.');
        const bytes = new Uint8Array(sample.allocationSize({ format: 'f32', planeIndex: 0 }));
        sample.copyTo(bytes, { format: 'f32', planeIndex: 0 });
        await api.audio(bytes, Math.round(sample.timestamp * 48_000));
      } finally {
        sample.close();
      }
    },
    closeAudio() {
      audioClosed = true;
    },
  };
}
