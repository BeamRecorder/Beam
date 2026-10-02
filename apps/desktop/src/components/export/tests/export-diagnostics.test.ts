import { gpuSummary } from '../../../../../../packages/system-metrics/src/tests/gpu-fixture';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildBeamExportReport } from '@beam/encoder/export-diagnostics';
import type { ExportDiagnostics } from '@beam/encoder/export-diagnostics-types';
import type { ExportProgress, ExportRequest } from '@beam/encoder/export-types';
import { EngineMetrics } from '@beam/runtime/performance/engine-metrics';

const request = {
  projectName: 'Vivid Horizon',
  format: 'webm',
  preset: 'high',
  snapshot: {
    duration: 10,
    render: { fps: 30, sourceWidth: null, sourceHeight: null },
    canvas: { width: 1920, height: 1080 },
    composition: {
      clips: [
        { kind: 'screen', enabled: true },
        { kind: 'audio', enabled: true, timelineDurationMs: 10_000 },
      ],
    },
  },
} as unknown as Omit<ExportRequest, 'format' | 'preset'>;

const diagnostics: ExportDiagnostics = {
  schemaVersion: 1,
  startedAt: '2026-08-15T10:00:00.000Z',
  completedAt: '2026-08-15T10:00:04.000Z',
  destinationDialogMs: 125,
  environment: {
    appVersion: '1.2.3',
    platform: 'linux',
    navigatorPlatform: 'Linux x86_64',
    userAgent: 'Electron/40.0',
    language: 'fr-FR',
    timezone: 'Europe/Paris',
    hardwareConcurrency: 12,
    deviceMemoryGb: 32,
    screen: '2560x1440',
    viewport: '1920x1080',
    devicePixelRatio: 1,
    webgpuAvailable: true,
    webglRenderer: 'Mesa GPU',
    offscreenCanvas: true,
    videoEncoder: true,
    videoDecoder: true,
    audioEncoder: true,
    audioDecoder: true,
    hardwareAcceleration: null,
  },
  runtime: {
    elapsedMs: 4_000,
    phase: 'finalizing',
    validationMs: 100,
    assetLoadingMs: 200,
    outputSetupMs: 50,
    videoPipelineMs: 2_500,
    audioPipelineMs: 1_100,
    muxFinalizationMs: 300,
    nativeFinalizationMs: 75,
    decodeMs: 500,
    renderMs: 800,
    encoderBackpressureMs: 1_200,
    ipcWriteWaitMs: 2_200,
    encodedFps: 75,
    audioRealtimeSpeed: 8.5,
    chunkCount: 9,
    bytesWritten: 2_097_152,
    videoCodec: 'vp9',
    audioCodec: 'opus',
    inputVideoCodecs: ['avc1.640028', 'vp9'],
    inputAudioCodecs: ['opus'],
    hardwareAcceleration: 'prefer-hardware',
    encoderCodec: 'vp09.00.10.08',
    encoderBitrate: 5_900_000,
    encoderBitrateMode: 'constant',
    encodedPacketCount: 300,
    keyFrameCount: 5,
    encodedVideoBytes: 1_900_000,
  },
};

const progress: ExportProgress = {
  stage: 'finalizing',
  overallProgress: 1,
  completedImages: 300,
  totalImages: 300,
  audioProgress: 1,
  currentTimeMs: 10_000,
  totalTimeMs: 10_000,
};

afterEach(() => vi.unstubAllGlobals());

describe('buildBeamExportReport', () => {
  it('includes the generic engine measurements from the export worker', () => {
    const engine = new EngineMetrics({ enabled: true });
    engine.observe('encode-wait', 5);
    const report = buildBeamExportReport({
      request,
      format: 'webm',
      preset: 'high',
      status: 'completed',
      progress,
      diagnostics: {
        ...diagnostics,
        runtime: { ...diagnostics.runtime!, engine: engine.snapshot() },
      },
    });
    expect(report).toContain('--- Engine Stages ---');
    expect(report).toContain('encode-wait: 1 operations, total 5.00 ms');
    expect(report).toContain('not additive frame time');
  });
  it('includes final export diagnostics while keeping output names and errors private', () => {
    const report = buildBeamExportReport({
      request,
      format: 'webm',
      preset: 'high',
      status: 'completed',
      progress,
      diagnostics,
      outputPath: '/home/albi/Vidéos/Beam/exports/vivid-horizon.webm',
      error: 'Decoder failed at file:///home/albi/Vidéos/Beam/secret/source.mp4; fallback /tmp/private.webm',
    });

    expect(report).toContain('=== Beam Export ===');
    expect(report).toContain('Status: completed');
    expect(report).toContain('Output File: vivid-horizon.webm');
    expect(report).not.toContain('/home/albi');
    expect(report).not.toContain('/tmp/private.webm');
    expect(report).toContain('Video Codec: vp9');
    expect(report).toContain('Audio Codec: opus');
    expect(report).toContain('Encoder Codec String: vp09.00.10.08');
    expect(report).toContain('Hardware Acceleration Request: prefer-hardware');
    expect(report).toContain('Encoder Bitrate Mode: constant');
    expect(report).toContain('Encoded Video Packets: 300');
    expect(report).toContain('Video Key Frames: 5');
    expect(report).toContain('WebGPU Available: true');
    expect(report).toContain('WebGL Renderer: Mesa GPU');
    expect(report).toContain('Destination Dialog: 125 ms');
    expect(report).toContain('Asset Validation: 100 ms');
    expect(report).toContain('Asset Loading: 200 ms');
    expect(report).toContain('Decode: 500 ms');
    expect(report).toContain('Canvas Render: 800 ms');
    expect(report).toContain('IPC / Disk Wait: 2200 ms');
    expect(report).toContain('Export Speed vs Realtime: 2.50x');
    expect(report).toContain('Audio Mix Speed vs Realtime: 8.50x');
    expect(report).toContain('Dominant Measured Bottleneck: IPC/disk wait');
    expect(report).toContain('Decoder failed at [redacted-path]');
  });

  it('reports completed audio when the transient progress state has already been cleared', () => {
    const report = buildBeamExportReport({
      request,
      format: 'webm',
      preset: 'high',
      status: 'completed',
      progress: null,
      diagnostics,
    });

    expect(report).toContain('Audio Progress: 100.0%');
  });

  it('does not count disabled or zero-duration audio clips in diagnostics', () => {
    const report = buildBeamExportReport({
      request: {
        ...request,
        snapshot: {
          ...request.snapshot,
          composition: {
            ...request.snapshot.composition,
            clips: [
              { kind: 'audio', enabled: true, timelineDurationMs: 0 },
              { kind: 'audio', enabled: false, timelineDurationMs: 10_000 },
            ] as unknown as ExportRequest['snapshot']['composition']['clips'],
          },
        },
      },
      format: 'webm',
      preset: 'high',
      status: 'completed',
      progress: null,
      diagnostics,
    });

    expect(report).toContain('Audio: None');
    expect(report).toContain('Audio Clips: 0');
    expect(report).toContain('Audio Progress: None');
  });

  it.each(['running', 'failed', 'cancelled'] as const)(
    'renders an actionable %s report before diagnostics arrive',
    (status) => {
      const report = buildBeamExportReport({
        request,
        format: 'webm',
        preset: 'medium',
        status,
        progress: null,
        diagnostics: null,
      });
      expect(report).toContain('Encoder Bitrate Mode: Unknown');
      expect(report).toContain('Hardware Encoder Check: Unknown');
      expect(report).toContain('Video Frames: 0 / 300');
      expect(report).toContain('Dominant Measured Bottleneck: Unknown');
      expect(report).toContain('Audio Progress: Unknown');
      expect(report).not.toContain('Hardware Encoder Error:');
    },
  );

  it('uses live worker diagnostics over a previous completed export', () => {
    const report = buildBeamExportReport({
      request,
      format: 'mp4',
      preset: 'low',
      status: 'running',
      diagnostics,
      progress: {
        ...progress,
        audioProgress: 0.5,
        diagnostics: {
          ...diagnostics.runtime!,
          phase: 'encoding',
          encoderBitrateMode: 'variable',
          hardwareEncoderCheck: 'unsupported',
          hardwareAcceleration: 'prefer-software',
        },
      },
    });
    expect(report).toContain('Encoder Bitrate Mode: variable');
    expect(report).toContain('Hardware Encoder Check: unsupported');
    expect(report).toContain('Hardware Acceleration Request: prefer-software');
    expect(report).toContain('Audio Progress: 50.0%');
  });

  it.each(['webcodecs', 'mediabunny-aac', undefined] as const)(
    'describes the audio implementation %s independently of video acceleration',
    (audioEncoderImplementation) => {
      const report = buildBeamExportReport({
        request,
        format: 'mp4',
        preset: 'high',
        status: 'completed',
        progress: null,
        diagnostics: { ...diagnostics, runtime: { ...diagnostics.runtime!, audioEncoderImplementation } },
      });
      expect(report).toContain(
        `Audio Encoder: ${audioEncoderImplementation === 'webcodecs' ? 'Native WebCodecs' : audioEncoderImplementation === 'mediabunny-aac' ? 'Mediabunny AAC-LC (WASM)' : 'Unknown'}`,
      );
    },
  );

  it.each([0, 2048, 2097152, Number.NaN, undefined])(
    'formats bounded output measurements %s with absent encoder metadata',
    (bytesWritten) => {
      const report = buildBeamExportReport({
        request: { ...request, includeAudio: false },
        format: 'webm',
        preset: 'high',
        status: 'running',
        progress: null,
        diagnostics: {
          ...diagnostics,
          environment: { ...diagnostics.environment, deviceMemoryGb: null },
          runtime: {
            ...diagnostics.runtime!,
            elapsedMs: 0,
            validationMs: null,
            encodedFps: null,
            audioRealtimeSpeed: null,
            encoderBitrate: null,
            encodedVideoBytes: bytesWritten,
            bytesWritten: bytesWritten ?? 0,
            encodedPacketCount: undefined,
            keyFrameCount: undefined,
            encoderCodec: null,
            audioCodec: null,
            videoCodec: null,
            inputAudioCodecs: [],
            inputVideoCodecs: [],
          },
        },
      });
      expect(report).toContain('Audio: Disabled from export');
      expect(report).toContain('Audio Encoder: None');
      expect(report).toContain('Encoding Throughput: Unknown');
      expect(report).toContain('Device Memory: Unknown');
      expect(report).toContain(
        'Encoded Video Bytes: ' +
          (bytesWritten === undefined || Number.isNaN(bytesWritten)
            ? 'Unknown'
            : bytesWritten === 0
              ? '0 B'
              : bytesWritten === 2048
                ? '2.0 KiB'
                : '2.0 MiB'),
      );
    },
  );

  it('renders hour-long timelines and non-finite measurements safely', () => {
    const report = buildBeamExportReport({
      request: { ...request, snapshot: { ...request.snapshot, duration: 3661 } },
      format: 'webm',
      preset: 'high',
      status: 'failed',
      diagnostics: {
        ...diagnostics,
        runtime: { ...diagnostics.runtime!, elapsedMs: Number.NaN, decodeMs: Number.NaN },
      },
      progress: null,
    });
    expect(report).toContain('Timeline Duration: 01:01:01.000');
    expect(report).toContain('Total Export Time: Unknown');
    expect(report).toContain('Decode: Unknown');
  });

  it('detects browser codec APIs when environment diagnostics are absent', () => {
    for (const name of ['OffscreenCanvas', 'VideoEncoder', 'VideoDecoder', 'AudioEncoder', 'AudioDecoder'])
      vi.stubGlobal(name, class {});
    const report = buildBeamExportReport({
      request: {
        ...request,
        snapshot: {
          ...request.snapshot,
          composition: undefined as unknown as ExportRequest['snapshot']['composition'],
        },
      },
      format: 'webm',
      preset: 'medium',
      status: 'completed',
      diagnostics: null,
      progress: null,
    });
    expect(report).toContain('OffscreenCanvas: true');
    expect(report).toContain('VideoEncoder / VideoDecoder: true / true');
    expect(report).toContain('AudioEncoder / AudioDecoder: true / true');
    expect(report).toContain('Audio: None');
  });
});

it.each(['variable', 'constant', undefined] as const)(
  'reports the selected bitrate mode %s without guessing absent measurements',
  (encoderBitrateMode) => {
    const report = buildBeamExportReport({
      request,
      format: 'webm',
      preset: 'high',
      status: 'completed',
      progress,
      diagnostics: { ...diagnostics, runtime: { ...diagnostics.runtime!, encoderBitrateMode } },
    });
    expect(report).toContain(`Encoder Bitrate Mode: ${encoderBitrateMode ?? 'Unknown'}`);
  },
);

it.each(['passed', 'unsupported', 'failed'] as const)(
  'reports the hardware encoder check %s and keeps error paths private',
  (hardwareEncoderCheck) => {
    const report = buildBeamExportReport({
      request,
      format: 'webm',
      preset: 'high',
      status: 'completed',
      progress,
      diagnostics: {
        ...diagnostics,
        runtime: {
          ...diagnostics.runtime!,
          hardwareEncoderCheck,
          hardwareEncoderError: 'Encoding error at /home/albi/private/source.mp4',
        },
      },
    });
    expect(report).toContain(`Hardware Encoder Check: ${hardwareEncoderCheck}`);
    expect(report).toContain('Hardware Encoder Error: Encoding error at [redacted-path]');
    expect(report).not.toContain('/home/albi');
  },
);

it('includes native GPU statistics and their scope in the copied report', () => {
  const report = buildBeamExportReport({
    request,
    format: 'webm',
    preset: 'high',
    status: 'completed',
    progress,
    diagnostics: { ...diagnostics, gpuUsage: gpuSummary() },
  });
  expect(report).toContain('GPU Busiest Engine: min 10.0%, median 30.0%, mean 40.0%, max 80.0%');
  expect(report).toContain('Beam GPU processes');
});
