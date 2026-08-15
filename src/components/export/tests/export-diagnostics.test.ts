import { describe, expect, it } from 'vitest';
import { buildBeamExportReport } from '../export-diagnostics';
import type { ExportDiagnostics } from '../export-diagnostics-types';
import type { ExportProgress, ExportRequest } from '../export-types';

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
        { kind: 'audio', enabled: true },
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

describe('buildBeamExportReport', () => {
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
});
