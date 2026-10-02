import type { ExportHostServices } from '../export-host-types';
import { vi } from 'vitest';
import { emptyComposition } from '@beam/engine';
import type { ExportRequest, ExportProgress } from '../export-types';
import type { ExportDiagnostics, ExportRuntimeDiagnostics } from '../export-diagnostics-types';

export class ExportWorkerFixture {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  emit(data: unknown) {
    this.onmessage?.({ data } as MessageEvent<unknown>);
  }
}
export const exportJobFixture = () => {
  const worker = new ExportWorkerFixture();
  const host = {
    createWorker: vi.fn(() => worker as unknown as Worker),
    writeChunk: vi.fn(async () => {}),
    finalize: vi.fn<ExportHostServices['finalize']>(async () => ({ path: '/output.webm' })),
    abort: vi.fn<ExportHostServices['abort']>(async () => {}),
  };
  const request = {
    projectName: 'Test',
    preset: 'medium',
    format: 'webm',
    snapshot: { duration: 1, render: { fps: 10 }, composition: emptyComposition() },
  } as ExportRequest;
  const diagnostics = {
    schemaVersion: 1,
    startedAt: '',
    completedAt: null,
    destinationDialogMs: 0,
    environment: {},
    runtime: null,
  } as ExportDiagnostics;
  const runtime: ExportRuntimeDiagnostics = {
    phase: 'finalizing',
    elapsedMs: 1,
    validationMs: 0,
    assetLoadingMs: 0,
    outputSetupMs: 0,
    videoPipelineMs: 0,
    audioPipelineMs: null,
    muxFinalizationMs: 0,
    nativeFinalizationMs: null,
    decodeMs: 0,
    renderMs: 0,
    encoderBackpressureMs: 0,
    ipcWriteWaitMs: 0,
    encodedFps: 10,
    audioRealtimeSpeed: null,
    chunkCount: 1,
    bytesWritten: 1,
    videoCodec: 'vp9',
    audioCodec: null,
    inputVideoCodecs: [],
    inputAudioCodecs: [],
  };
  const progress: ExportProgress = {
    stage: 'encoding',
    overallProgress: 0.5,
    completedImages: 5,
    totalImages: 10,
    audioProgress: null,
    currentTimeMs: 500,
    totalTimeMs: 1000,
  };
  return { worker, host, request, diagnostics, runtime, progress, controller: new AbortController() };
};
