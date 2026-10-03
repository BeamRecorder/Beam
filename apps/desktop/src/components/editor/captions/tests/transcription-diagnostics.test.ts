import { describe, expect, it } from 'vitest';
import { buildBeamTranscriptionReport, formatTranscriptionElapsed } from '../transcription-diagnostics';
import type { TranscriptionDiagnostics } from '../whisper-types';

const diagnostics: TranscriptionDiagnostics = {
  status: 'completed',
  startedAt: '2026-08-15T10:00:00.000Z',
  finishedAt: '2026-08-15T10:01:00.000Z',
  elapsedMs: 60_000,
  model: 'Xenova/whisper-tiny',
  locale: 'fr-FR',
  requestedDurationMs: 65_000,
  audioDurationMs: 65_000,
  sampleRate: 16_000,
  sampleCount: 1_040_000,
  pcmBytes: 4_160_000,
  audioFetchMs: 500,
  audioDecodeMs: 1_500,
  audioResampleMs: 800,
  backend: 'webgpu',
  dtype: 'q8',
  transformersVersion: '4.2.0',
  gpu: {
    vendor: 'Test Vendor',
    architecture: 'Test Architecture',
    device: 'Test Device',
    description: 'Test GPU',
    features: ['timestamp-query'],
    limits: {
      maxBufferSize: 1,
      maxComputeInvocationsPerWorkgroup: 2,
      maxComputeWorkgroupStorageSize: 3,
      maxStorageBufferBindingSize: 4,
    },
  },
  hardwareConcurrency: 12,
  crossOriginIsolated: true,
  wasmThreads: null,
  userAgent: 'Beam diagnostics test',
  chunkLengthSeconds: 30,
  strideLengthSeconds: 5,
  completedChunks: 3,
  totalChunks: 3,
  processedAudioMs: 65_000,
  modelLoadMs: 4_000,
  inferenceMs: 20_000,
  modelWasWarm: false,
  wordCount: 42,
  sentenceCount: 7,
  error: null,
};

describe('transcription diagnostics', () => {
  it('formats elapsed times for short and long phases', () => {
    expect(formatTranscriptionElapsed(250)).toBe('250 ms');
    expect(formatTranscriptionElapsed(2_500)).toBe('2.50 s');
    expect(formatTranscriptionElapsed(65_000)).toBe('1m 5.0s');
  });

  it('reports measured preparation, runtime, windowing, progress and speed data', () => {
    const report = buildBeamTranscriptionReport(diagnostics, 'Microphone');

    expect(report).toContain('Source: Microphone');
    expect(report).toContain('Model: Xenova/whisper-tiny');
    expect(report).toContain('Locale hint: fr-FR');
    expect(report).toContain('Window: 30s with 5s context');
    expect(report).toContain('Backend: webgpu');
    expect(report).toContain('GPU vendor: Test Vendor');
    expect(report).toContain('Hardware concurrency: 12');
    expect(report).toContain('Chunks: 3 / 3');
    expect(report).toContain('Words: 42');
    expect(report).toContain('Audio fetch: 500 ms');
    expect(report).toContain('Model load: 4.00 s');
    expect(report).toContain('Inference: 20.00 s');
    expect(report).toContain('Inference speed: 3.25x real time');
    expect(report).toContain('Largest measured phase: Inference (74.6% of measured phases)');
  });

  it('does not invent GPU or timing details when diagnostics are unavailable', () => {
    const report = buildBeamTranscriptionReport(
      {
        ...diagnostics,
        status: 'failed',
        finishedAt: null,
        backend: 'wasm',
        gpu: null,
        wasmThreads: 1,
        modelLoadMs: 0,
        inferenceMs: 0,
        error: 'Worker exploded',
      },
      null,
    );

    expect(report).toContain('Source: Unavailable');
    expect(report).toContain('Backend: wasm');
    expect(report).toContain('GPU vendor: Unavailable');
    expect(report).toContain('WASM threads: 1');
    expect(report).toContain('Inference speed: Pending');
    expect(report).toContain('Largest measured phase: Audio decode');
    expect(report).toContain('[Error]\nWorker exploded');
  });
});
