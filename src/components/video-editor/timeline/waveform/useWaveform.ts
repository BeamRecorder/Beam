import { ref, onUnmounted } from 'vue';

interface WavInfo {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  audioFormat: number;
  dataOffset: number;
  dataLength: number;
}

function parseWav(buffer: ArrayBuffer): WavInfo {
  const view = new DataView(buffer);
  
  // Find chunks
  let pos = 12;
  let sampleRate = 44100;
  let channels = 2;
  let bitsPerSample = 16;
  let audioFormat = 1;
  let dataOffset = 44;
  let dataLength = buffer.byteLength - 44;
  
  while (pos < buffer.byteLength - 8) {
    const chunkId = String.fromCharCode(
      view.getUint8(pos),
      view.getUint8(pos + 1),
      view.getUint8(pos + 2),
      view.getUint8(pos + 3)
    );
    const chunkSize = view.getUint32(pos + 4, true);
    
    if (chunkId === 'fmt ') {
      audioFormat = view.getUint16(pos + 8, true);
      channels = view.getUint16(pos + 10, true);
      sampleRate = view.getUint32(pos + 12, true);
      bitsPerSample = view.getUint16(pos + 20, true);
    } else if (chunkId === 'data') {
      dataOffset = pos + 8;
      dataLength = chunkSize;
      break;
    }
    pos += 8 + chunkSize;
  }
  
  return { sampleRate, channels, bitsPerSample, audioFormat, dataOffset, dataLength };
}

function getAudioDataSlice(buffer: ArrayBuffer, info: WavInfo, startTime: number, endTime: number): Float32Array {
  const bytesPerSample = info.bitsPerSample / 8;
  const stride = info.channels;
  
  const startSample = Math.max(0, Math.floor(startTime * info.sampleRate));
  const maxSamples = Math.floor(info.dataLength / (bytesPerSample * stride));
  const endSample = Math.min(Math.ceil(endTime * info.sampleRate), maxSamples);
  
  const sampleCount = endSample - startSample;
  if (sampleCount <= 0) return new Float32Array(0);
  
  const result = new Float32Array(sampleCount);
  const dataView = new DataView(buffer, info.dataOffset);
  
  if (info.audioFormat === 3 && info.bitsPerSample === 32) {
    // 32-bit float
    for (let i = 0; i < sampleCount; i++) {
      const sampleIdx = (startSample + i) * stride;
      result[i] = dataView.getFloat32(sampleIdx * 4, true);
    }
  } else if (info.audioFormat === 1 && info.bitsPerSample === 16) {
    // 16-bit PCM integer
    for (let i = 0; i < sampleCount; i++) {
      const sampleIdx = (startSample + i) * stride;
      result[i] = dataView.getInt16(sampleIdx * 2, true) / 32768.0;
    }
  } else {
    // Unsupported format, return silent data
    return new Float32Array(sampleCount);
  }
  
  return result;
}

export function useWaveform() {
  const peaks = ref<Float32Array | null>(null);
  const progress = ref<number>(0);
  const isProcessing = ref<boolean>(false);
  const error = ref<string | null>(null);
  
  let worker: Worker | null = null;

  const terminateWorker = () => {
    if (worker) {
      worker.terminate();
      worker = null;
    }
  };

  const generateWaveform = (audioData: Float32Array, targetPoints: number = 1000) => {
    // Reset state
    terminateWorker();
    progress.value = 0;
    isProcessing.value = true;
    error.value = null;

    if (audioData.length === 0) {
      peaks.value = null;
      isProcessing.value = false;
      return;
    }

    try {
      // Instantiate worker using standard Vite syntax
      worker = new Worker(
        new URL('./waveform.worker.ts', import.meta.url),
        { type: 'module' }
      );

      worker.onmessage = (event: MessageEvent) => {
        const { type, progress: prog, peaks: computedPeaks, message } = event.data;

        if (type === 'progress') {
          progress.value = prog;
        } else if (type === 'done') {
          progress.value = 100;
          peaks.value = computedPeaks;
          isProcessing.value = false;
          terminateWorker();
        } else if (type === 'error') {
          error.value = message;
          isProcessing.value = false;
          terminateWorker();
        }
      };

      worker.onerror = (err) => {
        error.value = err.message || 'Worker thread execution error';
        isProcessing.value = false;
        terminateWorker();
      };

      // Post message with transferable float array for speed and memory efficiency
      worker.postMessage(
        { type: 'process', audioData, targetPoints },
        [audioData.buffer] // transfer the underlying ArrayBuffer
      );
    } catch (err: any) {
      error.value = err.message || 'Failed to initialize worker';
      isProcessing.value = false;
      terminateWorker();
    }
  };

  const generateWaveformFromWav = (wavBuffer: ArrayBuffer, startTime: number, endTime: number, targetPoints: number = 1000) => {
    try {
      const info = parseWav(wavBuffer);
      const audioData = getAudioDataSlice(wavBuffer.slice(0), info, startTime, endTime);
      generateWaveform(audioData, targetPoints);
    } catch (err: any) {
      error.value = err.message || 'Failed to parse WAV file';
    }
  };

  const generateWaveformFromAudioBuffer = (audioBuffer: AudioBuffer, startTime: number, endTime: number, targetPoints: number = 1000) => {
    const start = Math.max(0, Math.floor(startTime * audioBuffer.sampleRate));
    const end = Math.min(audioBuffer.length, Math.ceil(endTime * audioBuffer.sampleRate));
    const samples = new Float32Array(Math.max(0, end - start));
    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
      const source = audioBuffer.getChannelData(channel).subarray(start, end);
      for (let index = 0; index < samples.length; index += 1) samples[index] += source[index] / audioBuffer.numberOfChannels;
    }
    generateWaveform(samples, targetPoints);
  };

  onUnmounted(() => {
    terminateWorker();
  });

  return {
    peaks,
    progress,
    isProcessing,
    error,
    generateWaveform,
    generateWaveformFromWav,
    generateWaveformFromAudioBuffer,
    cancel: terminateWorker
  };
}
