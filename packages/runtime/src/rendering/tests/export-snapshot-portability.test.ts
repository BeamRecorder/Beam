import { expect, it } from 'vitest';
import type { ProjectEditorData } from '@beam/engine/capture/capture-session';
import { assertJsonValue } from '@beam/engine/document/json-value';
import { createRenderDocument } from '@beam/engine/document/render-document';
import { validateRenderDocument } from '@beam/engine/document/render-document-validation';
import { createCompositionSnapshot } from '../snapshot';

function input(): Parameters<typeof createCompositionSnapshot>[0] {
  const document = createRenderDocument(undefined, 1920, 1080, 60);
  return {
    duration: 13.842,
    fps: 60,
    canvas: document.canvas,
    background: null,
    blurPercent: 0,
    editorData: null,
    zooms: [],
    composition: document.composition,
    cursorSettings: document.cursorSettings,
    cursorPack: null,
  };
}

it('produces a portable default snapshot accepted by the GPU export validator', () => {
  const snapshot = createCompositionSnapshot(input());
  expect(() => validateRenderDocument(structuredClone(snapshot))).not.toThrow();
  expect(snapshot.canvas.watermark).not.toHaveProperty('renderedText');
  expect(snapshot.render.fps).toBe(60);
  expect(snapshot.duration).toBe(13.842);
});

it('omits unset cursor telemetry metadata without changing recorded points or events', () => {
  const value = input();
  const cursor: ProjectEditorData['cursor'] = {
    available: true,
    events: [{ event: 'shape', sessionNs: 1, cursorId: 'arrow', shapeId: undefined, hotspot: { x: 2, y: 3 } }],
    telemetry: [{ timeMs: 1, cx: 0.2, cy: 0.3, interactionType: undefined, cursorType: undefined }],
    shapes: {},
    catalog: { arrow: { cursorKind: 'default', nativeCursorId: 'arrow', hotspot: { x: 2, y: 3 } } },
    missing: [],
  };
  value.editorData = {
    sessionId: 'session',
    manifest: {
      schemaVersion: 2,
      projectId: 'project',
      sessionId: 'session',
      createdAtUtc: '',
      sessionStartMonotonicNs: 0,
      durationNs: 13_842_000_000,
      platform: { os: 'linux' },
      selectedSources: {},
      tracks: [],
      permissions: {},
      warnings: [],
      completed: true,
    },
    videoSrc: null,
    videoSessionPath: null,
    tracks: [],
    recordedPlatform: 'linux',
    zoom: { elements: [], generatedSessions: [] },
    cursor,
  };
  const snapshot = createCompositionSnapshot(value);
  expect(() => validateRenderDocument(structuredClone(snapshot))).not.toThrow();
  expect(snapshot.cursor.telemetry).toEqual([{ timeMs: 1, cx: 0.2, cy: 0.3 }]);
  expect(snapshot.cursor.events[0]).not.toHaveProperty('shapeId');
  expect(cursor.telemetry[0]).toHaveProperty('cursorType', undefined);
  cursor.telemetry[0]!.cx = 0.9;
  cursor.catalog.arrow!.hotspot.x = 90;
  expect(snapshot.cursor.telemetry[0]!.cx).toBe(0.2);
  expect(snapshot.cursor.catalog.arrow!.hotspot.x).toBe(2);
  Reflect.deleteProperty(cursor, 'catalog');
  expect(createCompositionSnapshot(value).cursor.catalog).toEqual({});
});

it('keeps a plain canvas without a background selection', () => {
  const value = input();
  value.canvas.showBackground = true;
  expect(createCompositionSnapshot(value).background).toBeNull();
});

it('preserves solid backgrounds and owns the selected font sources', () => {
  const value = input();
  value.canvas.showBackground = true;
  value.background = { id: 'solid', name: 'Solid', kind: 'color', color: '#123456' };
  const fontId = 'a'.repeat(64);
  value.fontSources = { [fontId]: 'project-media://fonts/inter.woff2' };
  const snapshot = createCompositionSnapshot(value);
  expect(() => validateRenderDocument(snapshot)).not.toThrow();
  expect(snapshot.background).toEqual({ kind: 'color', color: '#123456' });
  value.fontSources[fontId] = 'project-media://fonts/changed.woff2';
  expect(snapshot.fontSources).toEqual({ [fontId]: 'project-media://fonts/inter.woff2' });
});

it('preserves gradient stops without retaining their mutable editor references', () => {
  const value = input();
  value.canvas.showBackground = true;
  value.background = {
    id: 'gradient',
    name: 'Gradient',
    kind: 'gradient',
    gradient: {
      type: 'linear',
      angle: 135,
      stops: [
        { id: 'start', position: 0, color: '#123456', alpha: 0.5 },
        { id: 'end', position: 1, color: '#654321', alpha: 1 },
      ],
    },
  };
  const snapshot = createCompositionSnapshot(value);
  expect(() => validateRenderDocument(snapshot)).not.toThrow();
  expect(snapshot.background).toEqual({ kind: 'gradient', gradient: value.background.gradient });
  value.background.gradient.stops[0]!.color = '#ffffff';
  expect(snapshot.background).toMatchObject({
    gradient: {
      stops: [
        { color: '#123456', alpha: 0.5 },
        { color: '#654321', alpha: 1 },
      ],
    },
  });
});

it.each(['image', 'video'] as const)('preserves %s background media locations', (kind) => {
  const value = input();
  value.canvas.showBackground = true;
  value.background = {
    id: 'media',
    name: 'Media',
    kind,
    path: 'project-media://background/source',
    extension: 'webm',
  };
  const snapshot = createCompositionSnapshot(value);
  expect(() => validateRenderDocument(snapshot)).not.toThrow();
  expect(snapshot.background).toEqual({ kind, src: 'project-media://background/source' });
});

it('preserves explicit zoom detachment and localized watermark text while omitting unset zoom options', () => {
  const value = input();
  value.canvas.watermark = { ...value.canvas.watermark!, localized: true, renderedText: 'créé avec Beam' };
  value.zooms = [
    {
      id: 'zoom',
      sessionId: 'session',
      startMs: 0,
      endMs: 1000,
      focus: { cx: 0.25, cy: 0.75 },
      depth: 2,
      mode: 'manual',
      linkedClipId: null,
      effect: undefined,
      glass: undefined,
    },
  ];
  const snapshot = createCompositionSnapshot(value);
  expect(() => assertJsonValue(snapshot)).not.toThrow();
  expect(() => validateRenderDocument(snapshot)).not.toThrow();
  expect(snapshot.zooms[0]!.linkedClipId).toBeNull();
  expect(snapshot.zooms[0]).not.toHaveProperty('effect');
  expect(snapshot.zooms[0]).not.toHaveProperty('glass');
  expect(snapshot.canvas.watermark!.renderedText).toBe('créé avec Beam');
  value.zooms[0]!.focus.cx = 0.9;
  expect(snapshot.zooms[0]!.focus.cx).toBe(0.25);
});
