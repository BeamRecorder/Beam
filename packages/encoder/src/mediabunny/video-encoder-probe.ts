import { CanvasSource, Mp4OutputFormat, NullTarget, Output, WebMOutputFormat } from 'mediabunny';
import type {
  VideoEncoderRequirements,
  VideoEncoderSelection,
} from '@beam/encoder/mediabunny/video-encoder-selection-types';

export async function probeHardwareVideoEncoder(
  requirements: VideoEncoderRequirements,
  selection: Pick<VideoEncoderSelection, 'codec' | 'quality' | 'hardwareAcceleration'>,
): Promise<string | null> {
  // Exercise buffer allocation as well as codec configuration. CPU-backed test
  // pixels avoid Chromium's VA-API native-buffer crash during GPU readback.
  // No export pixels are read back here.
  const canvas = new OffscreenCanvas(requirements.width, requirements.height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return 'Unable to create the hardware encoder test image.';
  context.fillRect(0, 0, canvas.width, canvas.height);
  let packets = 0;
  const source = new CanvasSource(canvas, {
    codec: selection.codec,
    quality: selection.quality,
    hardwareAcceleration: selection.hardwareAcceleration,
    latencyMode: 'quality',
    onEncodedPacket: () => {
      packets += 1;
    },
  });
  const output = new Output({
    format: requirements.format === 'mp4' ? new Mp4OutputFormat() : new WebMOutputFormat(),
    target: new NullTarget(),
  });
  output.addVideoTrack(source, { frameRate: requirements.frameRate });
  try {
    await output.start();
    await source.add(0, 1 / requirements.frameRate);
    source.close();
    await output.finalize();
    return packets > 0 ? null : 'The hardware encoder returned no video packet.';
  } catch (error) {
    return (error instanceof Error ? error.message : String(error)).slice(0, 500);
  } finally {
    source.close();
    if (output.state === 'pending' || output.state === 'started') await output.cancel();
  }
}
