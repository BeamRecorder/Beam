import { describe, expect, it } from 'vitest';
import { isExportWorkerRequest, isExportWorkerResponse } from '../export-worker-protocol';

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
});
