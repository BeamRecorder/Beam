// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { emptyComposition } from '@beam/engine';
import { readExportRequest } from './export-request';
import { createDefaultCaptionStyle } from '@beam/engine/shared/composition-defaults';

const request = () => ({
  projectName: 'Owned job',
  format: 'webm',
  preset: 'high',
  snapshot: {
    duration: 1,
    render: { fps: 30 },
    canvas: { width: 64, height: 64 },
    zooms: [],
    cursor: { events: [], telemetry: [] },
    cursorSettings: { enabled: false },
    composition: emptyComposition(),
  },
});
describe('CLI export job validation', () => {
  it('requires a host font source for every imported text font before backend startup', () => {
    const value = request(),
      font = 'a'.repeat(64);
    value.snapshot.composition.clips.push({
      id: 'text',
      name: 'Text',
      kind: 'caption',
      timelineStartMs: 0,
      timelineDurationMs: 1000,
      sourceInMs: 0,
      sourceDurationMs: 1000,
      playbackRate: 1,
      order: 0,
      enabled: true,
      transitions: { entry: null, exit: null },
      caption: { type: 'text', sentences: [], style: { ...createDefaultCaptionStyle(), fontAssetId: font } },
    });
    expect(() => readExportRequest(value)).toThrow('Missing portable font source');
    expect(
      readExportRequest({ ...value, snapshot: { ...value.snapshot, fontSources: { [font]: 'font.ttf' } } }),
    ).toBeTruthy();
  });
  it.each([null, [], { invalid: '/font.ttf' }, { ['a'.repeat(64)]: '' }, { ['a'.repeat(64)]: 42 }])(
    'rejects malformed portable font sources %j',
    (fontSources) => {
      expect(() => readExportRequest({ ...request(), snapshot: { ...request().snapshot, fontSources } })).toThrow(
        'font sources',
      );
    },
  );
  it('accepts explicit portable font resources', () => {
    const value = { ...request(), snapshot: { ...request().snapshot, fontSources: { ['a'.repeat(64)]: 'font.ttf' } } };
    expect(readExportRequest(value)).toBe(value);
  });
  it('accepts validated settings without copying the owned JSON object', () => {
    const value = request();
    expect(readExportRequest(value)).toBe(value);
  });
  it.each([null, [], {}, { ...request(), format: 'avi' }, { ...request(), preset: 'unknown' }])(
    'rejects invalid jobs %j',
    (value) => {
      expect(() => readExportRequest(value)).toThrow();
    },
  );
  it.each([0, NaN, 241, -1])('rejects invalid FPS %s before creating a backend', (fps) => {
    const value = request();
    value.snapshot.render.fps = fps;
    expect(() => readExportRequest(value)).toThrow();
  });
  it.each([0, NaN, 16385, 63.5])('rejects invalid canvas dimensions %s', (width) => {
    const value = request();
    value.snapshot.canvas.width = width;
    expect(() => readExportRequest(value)).toThrow();
  });
  it('validates the composition independently of backend availability', () => {
    const value = request();
    value.snapshot.composition.schemaVersion = -1;
    expect(() => readExportRequest(value)).toThrow('schema');
  });
});
