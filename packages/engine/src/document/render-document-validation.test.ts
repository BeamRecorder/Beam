// @vitest-environment node
import { expect, it } from 'vitest';
import { createRenderDocument } from './render-document';
import { validateRenderDocument } from './render-document-validation';
import { validateCanvas, validateBackground } from './presentation-validation';
import { DEFAULT_PHONE_FRAME_GRADIENT } from '../shared/color-fill-types';
import type { CompositionSnapshot } from '../shared/render-document-types';
import type { OutputCanvasSettings } from '../layout/output-canvas-types';

const snapshot = () => createRenderDocument(undefined, 64, 64, 30);
const validate = (value: unknown) => validateRenderDocument(value as CompositionSnapshot);
it('accepts authored zooms, explicit font capabilities and all supported backgrounds', () => {
  const document = snapshot();
  document.zooms = [
    {
      id: 'zoom',
      sessionId: 'session',
      startMs: 0,
      endMs: 1000,
      focus: { cx: 0.5, cy: 0.5 },
      depth: 2,
      mode: 'manual',
    },
  ];
  document.render.sourceWidth = 64;
  document.render.sourceHeight = 64;
  document.fontSources = { ['a'.repeat(64)]: 'fonts/title.woff2' };
  validate(document);
  for (const background of [
    null,
    { kind: 'color', color: '#123456' },
    { kind: 'gradient', gradient: DEFAULT_PHONE_FRAME_GRADIENT },
    { kind: 'image', src: 'image.png' },
    { kind: 'video', src: 'video.webm' },
  ])
    validate({ ...document, background });
  validateBackground({ kind: 'image', path: 'image.png' }, true);
  const canvas = structuredClone(document.canvas);
  delete canvas.watermark;
  validateCanvas(canvas);
});
it('rejects invalid video settings before opening a rendering backend', () => {
  const document = snapshot();
  const invalid = [
    null,
    { duration: 0 },
    { duration: '1' },
    { render: null },
    { render: { ...document.render, fps: 0 } },
    { render: { ...document.render, fps: 241 } },
    { canvas: null },
    { canvas: { ...document.canvas, width: 1 } },
    { blurPercent: -1 },
    { blurPercent: 101 },
    { zooms: null },
    { cursor: null },
    { cursor: { ...document.cursor, events: null } },
    { cursor: { ...document.cursor, telemetry: null } },
    { cursorSettings: null },
    { cursorSettings: { enabled: 'yes' } },
    { fontSources: { ['a'.repeat(64)]: '' } },
    { fontSources: { bad: 'font.woff' } },
    { fontSources: [] },
    { fontSources: null },
    { render: { ...document.render, sourceWidth: 0 } },
    { render: { ...document.render, sourceHeight: 0.5 } },
  ];
  for (const patch of invalid)
    expect(() => validate(patch === null ? null : { ...document, ...patch })).toThrow(TypeError);
});
it('rejects malformed zooms, duplicate IDs and invalid canvas/watermark presentation', () => {
  const document = snapshot(),
    zoom = {
      id: 'zoom',
      sessionId: 'session',
      startMs: 0,
      endMs: 1000,
      focus: { cx: 0.5, cy: 0.5 },
      depth: 2,
      mode: 'manual',
    };
  for (const value of [
    null,
    { ...zoom, id: '' },
    { ...zoom, id: 3 },
    { ...zoom, sessionId: null },
    { ...zoom, focus: null },
    { ...zoom, startMs: -1 },
    { ...zoom, endMs: 0 },
    { ...zoom, depth: 7 },
    { ...zoom, mode: 'unknown' },
  ])
    expect(() => validate({ ...document, zooms: [value] })).toThrow(TypeError);
  expect(() => validate({ ...document, zooms: [zoom, zoom] })).toThrow(TypeError);
  for (const patch of [{ preset: 'invalid' }, { showBackground: 1 }, { height: 16385 }])
    expect(() => validateCanvas({ ...document.canvas, ...patch } as OutputCanvasSettings)).toThrow(TypeError);
  for (const patch of [
    { enabled: 1 },
    { showLogo: null },
    { localized: 0 },
    { text: 'invalid' },
    { position: 'center' },
    { size: -1 },
    { shadow: -1 },
    { backgroundOpacity: 101 },
    { backgroundColor: 2 },
  ])
    expect(() =>
      validateCanvas({
        ...document.canvas,
        watermark: { ...document.canvas.watermark, ...patch },
      } as OutputCanvasSettings),
    ).toThrow(TypeError);
  for (const value of [
    undefined,
    false,
    { kind: 'unknown' },
    { kind: 'color', color: '' },
    { kind: 'image', src: '' },
    { kind: 'gradient', gradient: {} },
  ])
    expect(() => validateBackground(value)).toThrow(TypeError);
  expect(() => validateBackground({ kind: 'video', path: 'video.webm' }, true)).toThrow(TypeError);
});
