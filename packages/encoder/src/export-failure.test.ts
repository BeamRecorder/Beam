import { describe, expect, it } from 'vitest';
import { ExportOperationError, exportOperationError } from './export-failure';
import { isExportFailureContext } from './export-failure-protocol';
import type { ExportOperationContext } from './export-failure-types';
import { exportZoomReport } from './export-zoom-report';
import type { CompositionSnapshot } from '@beam/engine/shared/render-document-types';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';

const context: ExportOperationContext = {
  operation: 'submit-video-frame',
  frame: {
    index: 150,
    timeMs: 6250,
    width: 1920,
    height: 1080,
    clipIds: ['screen-clip'],
  },
};
const zoom = (index: number): ZoomElement => ({
  id: `zoom-${index}`,
  sessionId: 'session',
  startMs: index * 1000,
  endMs: index * 1000 + 500,
  depth: 3,
  mode: 'manual',
  focus: { cx: 0.4, cy: 0.6 },
  projection: '3d',
  tiltIntensity: 1.4,
  tiltHorizontal: -0.75,
  tiltVertical: 0.25,
  tiltPreset: 'custom',
});

describe('export failure context', () => {
  it('preserves the original native error and identifies the operation frame in its message', () => {
    const original = new DOMException('Encoding error.', 'EncodingError');
    const error = exportOperationError(original, context) as ExportOperationError;
    expect(error.name).toBe('EncodingError');
    expect(error.cause).toBe(original);
    expect(error.message).toContain('submit-video-frame; frame 151 at 6.250 s; 1920×1080');
    expect(error.failure).toEqual({ ...context, errorName: 'EncodingError', errorMessage: 'Encoding error.' });
    expect(isExportFailureContext(JSON.parse(JSON.stringify(error.failure)))).toBe(true);
  });
  it('keeps setup and mux failures free of an invented frame', () => {
    for (const operation of ['configure-output', 'finalize-output'] as const) {
      const error = exportOperationError(new Error('codec failed'), { operation }) as ExportOperationError;
      expect(error.message).toBe('codec failed');
      expect(error.failure.frame).toBeUndefined();
    }
  });
  it('preserves cancellation and previously captured failures without relabelling their stage', () => {
    const cancelled = new DOMException('Cancelled', 'AbortError');
    expect(exportOperationError(cancelled, context)).toBe(cancelled);
    const original = exportOperationError(new Error('failed'), context);
    expect(exportOperationError(original, { operation: 'encode-audio' })).toBe(original);
  });
  it.each([null, 'encoder unavailable', 42])('retains non-Error failures %s', (value) => {
    const error = exportOperationError(value, { operation: 'prepare-video' }) as ExportOperationError;
    expect(error.failure).toEqual({ operation: 'prepare-video', errorName: 'Error', errorMessage: String(value) });
  });
  it('bounds native error strings before crossing the Worker boundary', () => {
    const original = new Error('e'.repeat(3000));
    original.name = 'n'.repeat(500);
    const error = exportOperationError(original, context) as ExportOperationError;
    expect(error.failure.errorName).toHaveLength(200);
    expect(error.failure.errorMessage).toHaveLength(2000);
  });
  it('validates setup context with no frame and the zero frame/time boundary', () => {
    const error = exportOperationError(new Error('setup'), { operation: 'configure-output' }) as ExportOperationError;
    expect(isExportFailureContext(error.failure)).toBe(true);
    expect(isExportFailureContext({ ...error.failure, frame: { ...context.frame, index: 0, timeMs: 0 } })).toBe(true);
  });
  it.each([null, [], 'failure', {}, { operation: 'unknown', errorName: 'Error', errorMessage: 'fail' }])(
    'rejects malformed failure context %j',
    (value) => expect(isExportFailureContext(value)).toBe(false),
  );
  it.each([
    { errorName: 5 },
    { errorName: 'n'.repeat(201) },
    { errorMessage: null },
    { errorMessage: 'e'.repeat(2001) },
    { frame: null },
    { frame: [] },
    { frame: { ...context.frame, index: -1 } },
    { frame: { ...context.frame, index: 0.5 } },
    { frame: { ...context.frame, timeMs: Infinity } },
    { frame: { ...context.frame, timeMs: -1 } },
    { frame: { ...context.frame, width: 0 } },
    { frame: { ...context.frame, height: NaN } },
    { frame: { ...context.frame, clipIds: null } },
    { frame: { ...context.frame, clipIds: Array(101).fill('clip') } },
    { frame: { ...context.frame, clipIds: [false] } },
    { frame: { ...context.frame, clipIds: ['x'.repeat(513)] } },
  ])('rejects invalid or unbounded failure field %j', (patch) => {
    const error = exportOperationError(new Error('failed'), context) as ExportOperationError;
    expect(isExportFailureContext({ ...error.failure, ...patch })).toBe(false);
  });
});

describe('export zoom report', () => {
  it('includes exact custom perspective and motion settings without copying media or cursor data', () => {
    const snapshot = {
      zooms: [{ ...zoom(1), privatePath: '/home/private/input.mp4' }],
      zoomMotionBlur: { enabled: true, intensity: 0.55 },
      zoomAutoFollow: { safeZone: 0.5, responsiveness: 0.55, directionLock: true },
    } as unknown as CompositionSnapshot;
    const report = exportZoomReport(snapshot, 1250).join('\n');
    expect(report).toContain('"tiltHorizontal":-0.75');
    expect(report).toContain('"tiltPreset":"custom"');
    expect(report).toContain('"intensity":0.55');
    expect(report).toContain('"safeZone":0.5');
    expect(report).not.toContain('privatePath');
    expect(report).not.toContain('/home/private');
  });
  it('bounds large projects and sorts nearest authored zooms without changing the document', () => {
    const zooms = Array.from({ length: 100 }, (_, index) => zoom(index));
    const snapshot = { zooms } as CompositionSnapshot;
    const report = exportZoomReport(snapshot, 99_100);
    expect(report.find((line) => line.startsWith('Zoom Elements:'))).toContain('100; showing 12 nearest');
    expect(JSON.parse(report.find((line) => line.startsWith('{'))!)).toMatchObject({ id: 'zoom-99' });
    expect(report.filter((line) => line.startsWith('{'))).toHaveLength(12);
    expect(zooms[0]!.id).toBe('zoom-0');
  });
  it('keeps document order when the failing frame is unknown and labels missing settings', () => {
    const report = exportZoomReport({ zooms: [zoom(2), zoom(1)] } as CompositionSnapshot);
    expect(report.join('\n')).toContain('Motion Blur: Unspecified');
    expect(report.join('\n')).toContain('Auto Follow: Unspecified');
    expect(JSON.parse(report.find((line) => line.startsWith('{'))!)).toMatchObject({ id: 'zoom-2' });
  });
  it('keeps empty or older reports empty rather than inventing camera settings', () => {
    expect(exportZoomReport({} as CompositionSnapshot)).toEqual([]);
    expect(exportZoomReport({ zooms: [] } as unknown as CompositionSnapshot)).toEqual([]);
  });
});
