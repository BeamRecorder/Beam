import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

const { exportWithMediabunny } = vi.hoisted(() => ({
  exportWithMediabunny: vi.fn(),
}));
vi.mock('../mediabunny/exporter', () => ({ exportWithMediabunny }));
import { useExportJob } from '../useExportJob';
import type { ExportRequest } from '../export-types';

const request = {
  projectName: 'Demo',
  format: 'webm' as const,
  preset: 'medium' as const,
  snapshot: {
    duration: 2,
    render: { fps: 30, sourceWidth: null, sourceHeight: null },
    composition: { schemaVersion: 3, assets: [], clips: [], keyboardCaptionSessions: [] },
  },
} as unknown as ExportRequest;

describe('useExportJob', () => {
  beforeEach(() => exportWithMediabunny.mockReset());
  it('publishes preparation, progress and a result', async () => {
    let reported: unknown;
    exportWithMediabunny.mockImplementation(async (...args: unknown[]) => {
      const progress = args[1];
      if (typeof progress === 'function') {
        reported = {
          stage: 'encoding',
          stageLabel: 'Encoding frame 1 of 2',
          overallProgress: 0.5,
          completedImages: 1,
          totalImages: 2,
          audioProgress: null,
          currentTimeMs: 1000,
          totalTimeMs: 2000,
        };
        progress(reported);
      }
      return { path: '/tmp/demo.webm', format: 'webm' };
    });
    const job = useExportJob();
    await job.start(request);
    expect(reported).toEqual({
      stage: 'encoding',
      stageLabel: 'Encoding frame 1 of 2',
      overallProgress: 0.5,
      completedImages: 1,
      totalImages: 2,
      audioProgress: null,
      currentTimeMs: 1000,
      totalTimeMs: 2000,
    });
    expect(job.progress.value).toBeNull();
    expect(job.result.value?.path).toBe('/tmp/demo.webm');
    expect(job.isExporting.value).toBe(false);
  });
  it('keeps destination selection separate from active export state', async () => {
    let choosingDuringCallback: boolean | undefined;
    let exportingDuringCallback: boolean | undefined;
    let choosingAfterCallback: boolean | undefined;
    let exportingAfterCallback: boolean | undefined;
    let job!: ReturnType<typeof useExportJob>;
    exportWithMediabunny.mockImplementation(async (...args: unknown[]) => {
      choosingDuringCallback = job.isChoosingDestination.value;
      exportingDuringCallback = job.isExporting.value;
      const onStarted = args[3];
      if (typeof onStarted === 'function') onStarted({ schemaVersion: 1 } as never);
      choosingAfterCallback = job.isChoosingDestination.value;
      exportingAfterCallback = job.isExporting.value;
      return { path: '/tmp/demo.webm', format: 'webm', diagnostics: null };
    });
    job = useExportJob();
    await job.start(request);

    expect(choosingDuringCallback).toBe(true);
    expect(exportingDuringCallback).toBe(false);
    expect(choosingAfterCallback).toBe(false);
    expect(exportingAfterCallback).toBe(true);
    expect(job.isChoosingDestination.value).toBe(false);
    expect(job.isExporting.value).toBe(false);
  });

  it('does not publish audio preparation progress for zero-duration audio clips', async () => {
    let preparationAudioProgress: number | null | undefined;
    let job!: ReturnType<typeof useExportJob>;
    exportWithMediabunny.mockImplementation(async (...args: unknown[]) => {
      const onStarted = args[3];
      if (typeof onStarted === 'function') {
        onStarted({ schemaVersion: 1 } as never);
        preparationAudioProgress = job.progress.value?.audioProgress;
      }
      return { path: '/tmp/demo.webm', format: 'webm', diagnostics: null };
    });
    job = useExportJob();

    await job.start({
      ...request,
      snapshot: {
        ...request.snapshot,
        composition: {
          ...request.snapshot.composition,
          clips: [
            { kind: 'audio', enabled: true, timelineDurationMs: 0 },
          ] as unknown as ExportRequest['snapshot']['composition']['clips'],
        },
      },
    });

    expect(preparationAudioProgress).toBeNull();
  });

  it('prevents concurrent submissions', async () => {
    let release!: () => void;
    exportWithMediabunny.mockReturnValue(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    const job = useExportJob();
    const first = job.start(request);
    await nextTick();
    await job.start(request);
    release();
    await first;
    expect(exportWithMediabunny).toHaveBeenCalledOnce();
  });
  it('reports regular errors and suppresses cancellation errors', async () => {
    const job = useExportJob();
    exportWithMediabunny.mockRejectedValueOnce(new Error('disk full'));
    await job.start(request);
    expect(job.error.value).toBe('disk full');
    exportWithMediabunny.mockRejectedValueOnce(new DOMException('cancelled', 'AbortError'));
    await job.start(request);
    expect(job.error.value).toBeNull();
  });
  it('aborts the active export', async () => {
    let signal!: AbortSignal;
    let resolve!: () => void;
    exportWithMediabunny.mockImplementation((...args: unknown[]) => {
      if (!args[2]) return Promise.resolve();
      signal = args[2] as AbortSignal;
      return new Promise<void>((done) => {
        resolve = done;
      });
    });
    const job = useExportJob();
    const running = job.start(request);
    await nextTick();
    job.cancel();
    expect(signal.aborted).toBe(true);
    resolve();
    await running;
  });
});
