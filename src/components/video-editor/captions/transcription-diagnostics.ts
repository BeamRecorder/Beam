import type { TranscriptionDiagnostics } from './whisper-types';

const formatDuration = (milliseconds: number) => {
  if (!Number.isFinite(milliseconds)) return 'Unavailable';
  if (milliseconds < 1_000) return `${Math.max(0, milliseconds).toFixed(0)} ms`;
  const seconds = Math.max(0, milliseconds) / 1_000;
  if (seconds < 60) return `${seconds.toFixed(2)} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${(seconds - minutes * 60).toFixed(1)}s`;
};

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Unavailable';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
};

const value = (input: string | number | null | undefined) =>
  input === null || input === undefined || input === '' ? 'Unavailable' : String(input);

const bottleneck = (diagnostics: TranscriptionDiagnostics) => {
  const phases = [
    ['Audio fetch', diagnostics.audioFetchMs],
    ['Audio decode', diagnostics.audioDecodeMs],
    ['Audio resample', diagnostics.audioResampleMs],
    ['Model load', diagnostics.modelLoadMs],
    ['Inference', diagnostics.inferenceMs],
  ] as const;
  const measured = phases.filter((phase) => phase[1] > 0);
  if (!measured.length) return 'Pending';
  const total = measured.reduce((sum, phase) => sum + phase[1], 0);
  const slowest = measured.reduce((current, phase) => (phase[1] > current[1] ? phase : current));
  return `${slowest[0]} (${((slowest[1] / total) * 100).toFixed(1)}% of measured phases)`;
};

export const formatTranscriptionElapsed = (milliseconds: number) => formatDuration(milliseconds);

export const buildBeamTranscriptionReport = (diagnostics: TranscriptionDiagnostics, sourceLabel: string | null) => {
  const inferenceSpeed =
    diagnostics.inferenceMs > 0 && diagnostics.audioDurationMs > 0
      ? `${(diagnostics.audioDurationMs / diagnostics.inferenceMs).toFixed(2)}x real time`
      : 'Pending';
  const gpu = diagnostics.gpu;
  const lines = [
    '=== Beam Transcription ===',
    `Status: ${diagnostics.status.toUpperCase()}`,
    `Started: ${diagnostics.startedAt}`,
    `Finished: ${value(diagnostics.finishedAt)}`,
    `Elapsed: ${formatDuration(diagnostics.elapsedMs)}`,
    `Report generated: ${new Date().toISOString()}`,
    '',
    '[Input]',
    `Source: ${value(sourceLabel)}`,
    `Requested timeline: ${diagnostics.requestedDurationMs === null ? 'Full source' : formatDuration(diagnostics.requestedDurationMs)}`,
    `Decoded audio: ${formatDuration(diagnostics.audioDurationMs)}`,
    `PCM: ${diagnostics.sampleRate.toLocaleString('en-US')} Hz mono, ${diagnostics.sampleCount.toLocaleString('en-US')} samples, ${formatBytes(diagnostics.pcmBytes)}`,
    '',
    '[Model]',
    `Model: ${diagnostics.model}`,
    `Locale hint: ${diagnostics.locale}`,
    `Precision: ${diagnostics.dtype}`,
    'Artifacts: quantized ONNX encoder and merged decoder',
    `Model cache: ${diagnostics.modelWasWarm ? 'Warm' : 'Cold'}`,
    `Window: ${diagnostics.chunkLengthSeconds}s with ${diagnostics.strideLengthSeconds}s context`,
    '',
    '[Runtime]',
    `Inference engine: ONNX Runtime Web via Transformers.js ${value(diagnostics.transformersVersion)}`,
    `Backend: ${value(diagnostics.backend)}`,
    `Hardware concurrency: ${value(diagnostics.hardwareConcurrency)}`,
    `Cross-origin isolated: ${diagnostics.crossOriginIsolated ? 'Yes' : 'No'}`,
    `WASM threads: ${value(diagnostics.wasmThreads)}`,
    `GPU vendor: ${value(gpu?.vendor)}`,
    `GPU architecture: ${value(gpu?.architecture)}`,
    `GPU device: ${value(gpu?.device)}`,
    `GPU description: ${value(gpu?.description)}`,
    `GPU features: ${gpu?.features.length ? gpu.features.join(', ') : 'Unavailable'}`,
    `GPU limits: ${
      gpu
        ? Object.entries(gpu.limits)
            .map(([name, limit]) => `${name}=${limit}`)
            .join(', ')
        : 'Unavailable'
    }`,
    `User agent: ${value(diagnostics.userAgent)}`,
    '',
    '[Progress]',
    `Chunks: ${diagnostics.completedChunks} / ${diagnostics.totalChunks}`,
    `Audio processed: ${formatDuration(diagnostics.processedAudioMs)} / ${formatDuration(diagnostics.audioDurationMs)}`,
    `Words: ${diagnostics.wordCount}`,
    `Sentences: ${diagnostics.sentenceCount}`,
    '',
    '[Performance]',
    `Audio fetch: ${formatDuration(diagnostics.audioFetchMs)}`,
    `Audio decode: ${formatDuration(diagnostics.audioDecodeMs)}`,
    `Audio resample: ${formatDuration(diagnostics.audioResampleMs)}`,
    `Model load: ${formatDuration(diagnostics.modelLoadMs)}`,
    `Inference: ${formatDuration(diagnostics.inferenceMs)}`,
    `Inference speed: ${inferenceSpeed}`,
    `Largest measured phase: ${bottleneck(diagnostics)}`,
  ];
  if (diagnostics.error) lines.push('', '[Error]', diagnostics.error);
  return lines.join('\n');
};
