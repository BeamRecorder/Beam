import { describe, expect, it } from 'vitest';
import { isExportWorkerRequest, isExportWorkerResponse } from '@beam/encoder/mediabunny/export-worker-protocol';
import type { ExportRuntimeDiagnostics } from '@beam/encoder/export-diagnostics-types';

const diagnostics: ExportRuntimeDiagnostics = {
  elapsedMs: 100,
  phase: 'finalizing',
  validationMs: 1,
  assetLoadingMs: 1,
  outputSetupMs: 1,
  videoPipelineMs: 90,
  audioPipelineMs: null,
  muxFinalizationMs: 1,
  nativeFinalizationMs: null,
  decodeMs: 1,
  renderMs: 1,
  encoderBackpressureMs: 80,
  ipcWriteWaitMs: 1,
  encodedFps: 30,
  audioRealtimeSpeed: null,
  chunkCount: 1,
  bytesWritten: 100,
  videoCodec: 'vp9',
  audioCodec: null,
  inputVideoCodecs: [],
  inputAudioCodecs: [],
};

const validProgress = {
  stage: 'encoding',
  overallProgress: 0.42,
  completedImages: 42,
  totalImages: 100,
  audioProgress: 0.3,
  currentTimeMs: 840,
  totalTimeMs: 2_000,
} as const;

describe('export worker protocol', () => {
  it.each(['webm', 'mp4'] as const)('accepts a %s start with prepared cursor images', (format) => {
    expect(
      isExportWorkerRequest({
        type: 'start',
        request: { projectName: 'Demo', format, preset: 'medium', snapshot: { duration: 1 } },
        cursorImages: [{ id: 'default', bitmap: { width: 144, height: 144 } }],
      }),
    ).toBe(true);
  });

  it('accepts start without cursor images when cursor rendering has no data', () => {
    expect(
      isExportWorkerRequest({
        type: 'start',
        request: { projectName: 'Demo', format: 'webm', preset: 'medium', snapshot: { duration: 1 } },
        cursorImages: [],
      }),
    ).toBe(true);
    expect(isExportWorkerRequest({ type: 'cancel' })).toBe(true);
    expect(isExportWorkerRequest({ type: 'chunkAck', sequence: 0 })).toBe(true);
    expect(isExportWorkerRequest({ type: 'chunkError', sequence: 1, message: 'disk full' })).toBe(true);
  });

  it('rejects malformed requests and unsafe chunk sequence values', () => {
    expect(isExportWorkerRequest({ type: 'start' })).toBe(false);
    expect(
      isExportWorkerRequest({
        type: 'start',
        request: { projectName: 'Demo', format: 'webm', preset: 'medium', snapshot: { duration: 1 } },
      }),
    ).toBe(false);
    expect(
      isExportWorkerRequest({
        type: 'start',
        request: { projectName: 'Demo', format: 'webm', preset: 'medium', snapshot: { duration: 1 } },
        cursorImages: [{ id: 'default', bitmap: { width: Number.NaN, height: 144 } }],
      }),
    ).toBe(false);
    expect(
      isExportWorkerRequest({
        type: 'start',
        request: { projectName: 'Demo', format: 'webm', preset: 'medium', snapshot: { duration: 1 } },
        cursorImages: [{ id: 42, bitmap: { width: 144, height: 144 } }],
      }),
    ).toBe(false);
    expect(
      isExportWorkerRequest({
        type: 'start',
        request: { projectName: 'Demo', format: 'webm', preset: 'medium', snapshot: { duration: 1 } },
        cursorImages: [
          { id: 'default', bitmap: { width: 144, height: 144 } },
          { id: 'default', bitmap: { width: 144, height: 144 } },
        ],
      }),
    ).toBe(false);
    expect(isExportWorkerRequest({ type: 'chunkAck', sequence: -1 })).toBe(false);
    expect(isExportWorkerRequest({ type: 'chunkAck', sequence: 1.5 })).toBe(false);
    expect(isExportWorkerRequest({ type: 'chunkError', sequence: 0, message: 42 })).toBe(false);
  });

  it('validates progress bounds and non-empty transferred chunks', () => {
    expect(isExportWorkerResponse({ type: 'progress', progress: validProgress })).toBe(true);
    expect(isExportWorkerResponse({ type: 'progress', progress: { ...validProgress, overallProgress: 1.1 } })).toBe(
      false,
    );
    expect(isExportWorkerResponse({ type: 'progress', progress: { ...validProgress, stage: 'preparing' } })).toBe(
      false,
    );
    expect(isExportWorkerResponse({ type: 'chunk', sequence: 0, position: 0, data: new Uint8Array([1]) })).toBe(true);
    expect(isExportWorkerResponse({ type: 'chunk', sequence: 0, position: 0, data: new Uint8Array() })).toBe(false);
  });

  it('accepts complete and structured worker errors', () => {
    expect(isExportWorkerResponse({ type: 'complete' })).toBe(false);
    expect(isExportWorkerResponse({ type: 'error', error: { name: 'Error', message: 'decode failed' } })).toBe(true);
    expect(isExportWorkerResponse({ type: 'error', error: { name: 'Error' } })).toBe(false);
    expect(isExportWorkerResponse({ type: 'unknown' })).toBe(false);
  });

  it.each(['variable', 'constant', undefined] as const)(
    'accepts complete and progress diagnostics with bitrate mode %s',
    (encoderBitrateMode) => {
      const value = { ...diagnostics, encoderBitrateMode };
      expect(isExportWorkerResponse({ type: 'complete', diagnostics: value })).toBe(true);
      expect(isExportWorkerResponse({ type: 'progress', progress: { ...validProgress, diagnostics: value } })).toBe(
        true,
      );
    },
  );

  it.each(['passed', 'unsupported', 'failed', undefined] as const)(
    'accepts hardware encoder checks %s',
    (hardwareEncoderCheck) => {
      expect(
        isExportWorkerResponse({
          type: 'complete',
          diagnostics: {
            ...diagnostics,
            hardwareEncoderCheck,
            hardwareEncoderError: 'Buffer allocation failed.',
            hardwareAcceleration: 'prefer-software',
          },
        }),
      ).toBe(true);
    },
  );

  it.each([
    { encoderBitrateMode: 'quantizer' },
    { encoderBitrateMode: 1 },
    { encoderBitrateMode: null },
    { hardwareEncoderCheck: 'maybe' },
    { hardwareEncoderCheck: 0 },
    { hardwareEncoderError: 1 },
    { hardwareEncoderError: 'x'.repeat(601) },
    { hardwareAcceleration: 'native' },
  ])('rejects malformed encoder diagnostics %j', (values) => {
    expect(isExportWorkerResponse({ type: 'complete', diagnostics: { ...diagnostics, ...values } })).toBe(false);
  });

  it.each([
    { elapsedMs: Number.NaN },
    { validationMs: 'slow' },
    { videoCodec: 1 },
    { audioCodec: false },
    { audioEncoderImplementation: 'external' },
    { inputVideoCodecs: [1] },
    { inputAudioCodecs: 'opus' },
    { encoderCodec: false },
    { encoderBitrate: 'high' },
    { encodedPacketCount: -1 },
    { keyFrameCount: 0.5 },
    { encodedVideoBytes: -1 },
  ])('rejects invalid runtime measurements %j', (values) => {
    expect(isExportWorkerResponse({ type: 'complete', diagnostics: { ...diagnostics, ...values } })).toBe(false);
  });

  it.each([null, 1, {}, { type: 1 }])('rejects an invalid message envelope %j', (value) => {
    expect(isExportWorkerRequest(value)).toBe(false);
    expect(isExportWorkerResponse(value)).toBe(false);
  });

  it.each([
    {
      encoderCodec: 'vp09.00.40.08',
      encoderBitrate: 5910000,
      encodedPacketCount: 30,
      keyFrameCount: 1,
      encodedVideoBytes: 1000,
      audioEncoderImplementation: 'webcodecs',
      hardwareEncoderError: null,
    },
    {
      encoderCodec: null,
      encoderBitrate: null,
      audioEncoderImplementation: 'mediabunny-aac',
      hardwareAcceleration: 'no-preference',
    },
    { hardwareAcceleration: 'prefer-hardware', hardwareEncoderError: 'x'.repeat(600) },
  ])('accepts optional encoder metadata %j', (values) => {
    expect(isExportWorkerResponse({ type: 'complete', diagnostics: { ...diagnostics, ...values } })).toBe(true);
  });

  it.each([
    { audioProgress: -1 },
    { completedImages: -1 },
    { totalImages: 0.5 },
    { currentTimeMs: Number.NaN },
    { totalTimeMs: -1 },
    { preview: 'file:///private.jpg' },
    { preview: 1 },
    { preview: 'x'.repeat(200000) },
    { diagnostics: {} },
  ])('rejects malformed progress %j', (values) => {
    expect(isExportWorkerResponse({ type: 'progress', progress: { ...validProgress, ...values } })).toBe(false);
  });

  it('accepts only bounded JPEG progress previews', () => {
    expect(
      isExportWorkerResponse({
        type: 'progress',
        progress: { ...validProgress, preview: 'data:image/jpeg;base64,AAAA', audioProgress: null },
      }),
    ).toBe(true);
    expect(isExportWorkerResponse({ type: 'progress' })).toBe(false);
    expect(isExportWorkerResponse({ type: 'chunk', sequence: 0, position: -1, data: new Uint8Array([1]) })).toBe(false);
  });

  it('validates programmable source descriptors and explicit preview/audio options', () => {
    const start = {
      type: 'start',
      request: { projectName: 'Demo', format: 'webm', preset: 'high', snapshot: { duration: 1 } },
      cursorImages: [],
    };
    expect(
      isExportWorkerRequest({
        ...start,
        request: {
          ...start.request,
          frameSources: [{ assetId: 'motion', url: '/frame' }],
          preview: true,
          includeAudio: false,
        },
      }),
    ).toBe(true);
    for (const values of [
      { frameSources: 'bad' },
      { frameSources: [{ assetId: '', url: '/frame' }] },
      { frameSources: [{ assetId: 'motion', url: '' }] },
      { frameSources: Array(101).fill({ assetId: 'motion', url: '/frame' }) },
      { preview: 1 },
      { includeAudio: 'yes' },
      { format: 'mov' },
      { preset: 'maximum' },
      { projectName: null },
      { snapshot: { duration: 0 } },
    ])
      expect(isExportWorkerRequest({ ...start, request: { ...start.request, ...values } })).toBe(false);
    for (const image of [
      { id: '', bitmap: { width: 1, height: 1 } },
      { id: 'cursor', bitmap: null },
      { id: 'cursor', bitmap: { width: 1, height: 0 } },
    ]) {
      expect(isExportWorkerRequest({ ...start, cursorImages: [image] })).toBe(false);
    }
  });
});
