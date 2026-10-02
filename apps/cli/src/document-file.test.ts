// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { emptyComposition, createComposition } from '@beam/engine';
import { readDocumentFile } from './document-file';
import { benchmarkDocument } from './benchmark';

describe('CLI document boundaries', () => {
  it('preserves Beam project metadata while replacing only the composition', () => {
    const value = { projectId: 'owned', editor: { composition: emptyComposition(), other: 1 }, sessions: [] };
    const document = readDocumentFile(value);
    const next = emptyComposition();
    expect(document.replace(next)).toEqual({ ...value, editor: { ...value.editor, composition: next } });
  });
  it('accepts standalone compositions, snapshots and export jobs', () => {
    const composition = emptyComposition();
    expect(readDocumentFile(composition).replace(composition)).toBe(composition);
    expect(readDocumentFile({ composition, duration: 1 }).replace(composition)).toEqual({ composition, duration: 1 });
    expect(readDocumentFile({ snapshot: { composition }, format: 'webm' }).replace(composition)).toEqual({
      snapshot: { composition },
      format: 'webm',
    });
  });
  it.each([
    null,
    [],
    {},
    { clips: [], assets: [] },
    { assets: [], clips: [], keyboardCaptionSessions: [], schemaVersion: -1 },
  ])('rejects malformed documents %j', (value) => {
    expect(() => readDocumentFile(value)).toThrow();
  });
  it('benchmarks the actual empty document using bounded stage samples', () => {
    const report = benchmarkDocument(emptyComposition(), 200);
    expect(report.iterations).toBe(200);
    expect(report.visibleClips).toBe(0);
    expect(report.editIterations).toBe(0);
    expect(report.metrics.stages.seek?.count).toBe(200);
    expect(report.metrics.stages.seek?.windowSamples).toBe(120);
    expect(report.metrics.stages.prepare?.count).toBe(1);
  });
  it.each([0, -1, NaN, 1.5, 1000001])('rejects invalid iteration count %s', (count) => {
    expect(() => benchmarkDocument(emptyComposition(), count)).toThrow(RangeError);
  });
  it('samples the full nonempty timeline and includes overlapping visible layers', () => {
    const composition = createComposition(
      [],
      [
        {
          id: 'color',
          trackId: 'color',
          kind: 'color',
          name: 'Background',
          enabled: true,
          order: 0,
          timelineStartMs: 0,
          timelineDurationMs: 1000,
          assetId: '',
          fill: { kind: 'color', color: '#ffffff' },
          sourceInMs: 0,
          sourceDurationMs: 1000,
          playbackRate: 1,
          transform: { x: 0, y: 0, width: 1, height: 1 },
        },
      ],
    );
    const report = benchmarkDocument(composition, 10);
    expect(report.durationMs).toBe(1000);
    expect(report.visibleClips).toBe(10);
    expect(report.editIterations).toBe(10);
    expect(report.metrics.stages.edit?.count).toBe(10);
    expect(composition.clips[0]!.enabled).toBe(true);
  });
});
