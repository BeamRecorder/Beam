const MIME_TYPE = 'audio/webm;codecs=opus';
const MICROPHONE_PREFIX = 'microphone:chromium:';

export interface BrowserMicrophoneFormat {
  codec: 'opus';
  sampleRate: number;
  channels: number;
}

export function microphoneDeviceId(sourceId: string) {
  if (!sourceId.startsWith(MICROPHONE_PREFIX) || sourceId.length === MICROPHONE_PREFIX.length)
    throw new Error('The selected microphone is invalid.');
  return sourceId.slice(MICROPHONE_PREFIX.length);
}

export function normalizedMicrophoneSetting(value: number | undefined) {
  return Number.isFinite(value) && value! >= 0 ? Math.round(value!) : 0;
}

export class BrowserMicrophoneSource {
  readonly stream: MediaStream;
  readonly track: MediaStreamTrack;
  readonly format: BrowserMicrophoneFormat;
  readonly sourceId: string;
  private readonly inputStream: MediaStream;
  private readonly audioContext: AudioContext;
  private readonly gain: GainNode;
  private readonly analyser: AnalyserNode;
  private released = false;

  constructor(
    inputStream: MediaStream,
    sourceId: string,
    track: MediaStreamTrack,
    audioContext: AudioContext,
    gain: GainNode,
    analyser: AnalyserNode,
    stream: MediaStream,
    format: BrowserMicrophoneFormat,
  ) {
    this.inputStream = inputStream;
    this.sourceId = sourceId;
    this.track = track;
    this.audioContext = audioContext;
    this.gain = gain;
    this.analyser = analyser;
    this.stream = stream;
    this.format = format;
  }

  sampleWaveform(sampleCount = 128): Float32Array {
    const count = Math.max(8, Math.min(512, Math.round(sampleCount)));
    const samples = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(samples);
    const result = new Float32Array(count * 2);
    for (let bucket = 0; bucket < count; bucket += 1) {
      const start = Math.floor((bucket / count) * samples.length);
      const end = Math.max(start + 1, Math.floor(((bucket + 1) / count) * samples.length));
      let minimum = 1;
      let maximum = -1;
      for (let index = start; index < end; index += 1) {
        const value = Number.isFinite(samples[index]) ? samples[index]! : 0;
        minimum = Math.min(minimum, value);
        maximum = Math.max(maximum, value);
      }
      result[bucket * 2] = minimum;
      result[bucket * 2 + 1] = maximum;
    }
    return result;
  }

  fadeTo(value: number) {
    const now = this.audioContext.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(this.gain.gain.value, now);
    this.gain.gain.linearRampToValueAtTime(value, now + 0.015);
  }

  release() {
    if (this.released) return;
    this.released = true;
    this.inputStream.getTracks().forEach((track) => track.stop());
    if (this.audioContext.state !== 'closed') void this.audioContext.close().catch(() => undefined);
  }
}

export async function requestBrowserMicrophoneSource(sourceId: string): Promise<BrowserMicrophoneSource> {
  if (!navigator.mediaDevices?.getUserMedia)
    throw new Error('Microphone access is unavailable in this Chromium build.');
  if (!MediaRecorder.isTypeSupported(MIME_TYPE))
    throw new Error('This Chromium build cannot record Opus WebM microphone audio.');
  const inputStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: { exact: microphoneDeviceId(sourceId) },
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
    video: false,
  });
  const track = inputStream.getAudioTracks()[0];
  if (!track) {
    inputStream.getTracks().forEach((entry) => entry.stop());
    throw new Error('The selected microphone did not provide an audio track.');
  }
  const settings = track.getSettings();
  let audioContext: AudioContext | null = null;
  try {
    audioContext = new AudioContext();
    const input = audioContext.createMediaStreamSource(inputStream);
    const gain = audioContext.createGain();
    const analyser = audioContext.createAnalyser();
    const destination = audioContext.createMediaStreamDestination();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.15;
    gain.gain.value = track.muted ? 0 : 1;
    input.connect(gain).connect(analyser).connect(destination);
    await audioContext.resume();
    return new BrowserMicrophoneSource(inputStream, sourceId, track, audioContext, gain, analyser, destination.stream, {
      codec: 'opus',
      sampleRate: normalizedMicrophoneSetting(settings.sampleRate),
      channels: normalizedMicrophoneSetting(settings.channelCount),
    });
  } catch (error) {
    inputStream.getTracks().forEach((entry) => entry.stop());
    if (audioContext) await audioContext.close().catch(() => undefined);
    throw error;
  }
}

export { MICROPHONE_PREFIX, MIME_TYPE };
