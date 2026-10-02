import { compositionDurationMs } from '../shared/timeline-mapping';
import { DEFAULT_OUTPUT_CANVAS } from '../layout/output-canvas';
import { createDefaultCursorPresentation } from '../capture/cursor-presentation';
import { emptyComposition, type ClipComposition } from '../shared/composition-types';
import type { CompositionSnapshot } from '../shared/render-document-types';
import { validateRenderDocument } from './render-document-validation';

/** A complete render document can be constructed by desktop, scripts or agent tools. */
export function createRenderDocument(
  composition: ClipComposition = emptyComposition(),
  width = 1920,
  height = 1080,
  fps = 30,
): CompositionSnapshot {
  const document: CompositionSnapshot = {
    duration: Math.max(1 / fps, compositionDurationMs(composition) / 1000),
    render: { fps, sourceWidth: null, sourceHeight: null },
    canvas: {
      ...DEFAULT_OUTPUT_CANVAS,
      preset: 'custom',
      width,
      height,
      showBackground: false,
    },
    background: null,
    blurPercent: 0,
    zooms: [],
    cursor: {
      available: false,
      events: [],
      telemetry: [],
      shapes: {},
      catalog: {},
      missing: [],
    },
    cursorSettings: { ...createDefaultCursorPresentation(), enabled: false },
    cursorPack: null,
    composition,
  };
  validateRenderDocument(document);
  return document;
}
