import { canEncodeVideo, Quality, type VideoCodec } from 'mediabunny';
import { probeHardwareVideoEncoder } from '@beam/encoder/mediabunny/video-encoder-probe';
import type {
  VideoEncoderRequirements,
  VideoEncoderSelection,
} from '@beam/encoder/mediabunny/video-encoder-selection-types';

export async function selectVideoEncoder(requirements: VideoEncoderRequirements): Promise<VideoEncoderSelection> {
  const { format, width, height, frameRate, bitrate } = requirements;
  const codecs: VideoCodec[] = format === 'webm' ? ['vp9', 'vp8', 'av1'] : ['avc'];
  let hardwareEncoderError: string | null = null;
  for (const hardwareAcceleration of ['prefer-hardware', 'prefer-software'] as const) {
    for (const codec of codecs) {
      // Some hardware encoders expose only constant bitrate. Probe both modes
      // at the export's actual dimensions, frame rate and target bitrate.
      for (const bitrateMode of ['variable', 'constant'] as const) {
        const quality = new Quality({ bitrate, bitrateMode });
        if (
          await canEncodeVideo(codec, {
            width,
            height,
            frameRate,
            quality,
            hardwareAcceleration,
            latencyMode: 'quality',
          })
        ) {
          if (hardwareAcceleration === 'prefer-hardware') {
            const error = await probeHardwareVideoEncoder(requirements, { codec, quality, hardwareAcceleration });
            if (error !== null) {
              hardwareEncoderError = `${codec} (${bitrateMode}): ${error}`;
              continue;
            }
          }
          return {
            codec,
            quality,
            hardwareAcceleration,
            bitrateMode,
            hardwareEncoderCheck:
              hardwareAcceleration === 'prefer-hardware'
                ? 'passed'
                : hardwareEncoderError === null
                  ? 'unsupported'
                  : 'failed',
            hardwareEncoderError: hardwareAcceleration === 'prefer-hardware' ? null : hardwareEncoderError,
          };
        }
      }
    }
  }
  throw new Error(`${format.toUpperCase()} video is not encodable on this device.`);
}
