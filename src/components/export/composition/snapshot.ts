import type { ProjectEditorData } from '../../../api/types/capture-api';
import type { BackgroundValue } from '../../video-editor/composables/backgroundCatalog';
import {
  normalizeZoomMotionBlur,
  type ZoomElement,
  type ZoomMotionBlurSettings,
} from '../../video-editor/zoom/zoom-types';
import type { ClipComposition } from '~/media/shared/composition-types';
import type { CursorRenderSettings, CompositionSnapshot } from '../export-types';
import type { OutputCanvasSettings } from '../../video-editor/canvas/output-canvas';
import { normalizeOutputCanvas } from '../../video-editor/canvas/output-canvas';
import { normalizeCursorAutoHideSettings, normalizeCursorMotionSettings } from '../../../api/types/cursor-settings';
import type { CursorPackDescriptor } from '../../../api/types/cursor-pack';

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const copyZooms = (zooms: readonly ZoomElement[]) => zooms.map((zoom) => ({ ...zoom, focus: { ...zoom.focus } }));
const copyCursor = (cursor: ProjectEditorData['cursor'] | undefined): CompositionSnapshot['cursor'] => {
  if (!cursor) return { available: false, events: [], telemetry: [], shapes: {}, catalog: {}, missing: [] };
  return {
    available: cursor.available,
    events: cursor.events.map((event) =>
      event.event === 'shape' ? { ...event, hotspot: { ...event.hotspot } } : { ...event },
    ),
    telemetry: cursor.telemetry.map((sample) => ({ ...sample })),
    shapes: Object.fromEntries(
      Object.entries(cursor.shapes).map(([shapeId, asset]) => [shapeId, { ...asset, hotspot: { ...asset.hotspot } }]),
    ),
    catalog: Object.fromEntries(
      Object.entries(cursor.catalog ?? {}).map(([cursorId, entry]) => [
        cursorId,
        { ...entry, hotspot: { ...entry.hotspot } },
      ]),
    ),
    missing: [...cursor.missing],
  };
};

export function createCompositionSnapshot(input: {
  duration: number;
  fps: number;
  canvas: OutputCanvasSettings;
  background: BackgroundValue | null;
  blurPercent: number;
  editorData: ProjectEditorData | null | undefined;
  zooms: ZoomElement[];
  zoomMotionBlur?: ZoomMotionBlurSettings;
  composition: ClipComposition;
  cursorSettings: CursorRenderSettings;
  cursorPack: CursorPackDescriptor | null;
}): CompositionSnapshot {
  const canvas = normalizeOutputCanvas(input.canvas);
  return {
    duration: Math.max(0, input.duration),
    render: {
      fps: Math.max(1, input.fps),
      sourceWidth: null,
      sourceHeight: null,
    },
    referenceCanvas: { width: canvas.width, height: canvas.height },
    canvas,
    background: !canvas.showBackground
      ? null
      : input.background?.kind === 'color'
        ? { kind: 'color', color: input.background.color }
        : input.background?.kind === 'gradient'
          ? { kind: 'gradient', gradient: cloneJson(input.background.gradient) }
          : input.background
            ? { kind: input.background.kind, src: input.background.path }
            : null,
    blurPercent: Math.max(0, Math.min(100, Math.round(input.blurPercent))),
    zooms: copyZooms(input.zooms),
    zoomMotionBlur: normalizeZoomMotionBlur(input.zoomMotionBlur),
    cursor: copyCursor(input.editorData?.cursor),
    cursorSettings: cloneJson({
      ...input.cursorSettings,
      motion: normalizeCursorMotionSettings(input.cursorSettings.motion),
      autoHide: normalizeCursorAutoHideSettings(input.cursorSettings.autoHide),
    }),
    cursorPack: input.cursorPack ? cloneJson(input.cursorPack) : null,
    composition: cloneJson(input.composition),
  };
}
