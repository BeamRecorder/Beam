import type { ProjectEditorData } from '@beam/engine/capture/capture-session';
import type { BackgroundValue } from '@beam/engine/shared/background-types';
import {
  normalizeZoomAutoFollow,
  normalizeZoomMotionBlur,
  type ZoomElement,
  type ZoomAutoFollowSettings,
  type ZoomMotionBlurSettings,
} from '@beam/engine/zoom/zoom-types';
import type { ClipComposition } from '@beam/engine/shared/composition-types';
import type { CursorRenderSettings, CompositionSnapshot } from '@beam/engine/shared/render-document-types';
import type { OutputCanvasSettings } from '@beam/engine/layout/output-canvas';
import { normalizeOutputCanvas } from '@beam/engine/layout/output-canvas';
import { normalizeCursorAutoHideSettings, normalizeCursorMotionSettings } from '@beam/engine/capture/cursor-settings';
import type { CursorPackDescriptor } from '@beam/engine/capture/cursor-pack';

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function createCompositionSnapshot(input: {
  duration: number;
  fps: number;
  canvas: OutputCanvasSettings;
  background: BackgroundValue | null;
  blurPercent: number;
  editorData: ProjectEditorData | null | undefined;
  zooms: ZoomElement[];
  zoomMotionBlur?: ZoomMotionBlurSettings;
  zoomAutoFollow?: ZoomAutoFollowSettings;
  composition: ClipComposition;
  cursorSettings: CursorRenderSettings;
  cursorPack: CursorPackDescriptor | null;
  fontSources?: Record<string, string>;
}): CompositionSnapshot {
  const canvas = normalizeOutputCanvas(input.canvas);
  const cursor = input.editorData?.cursor;
  // Capture the entire export payload as owned JSON once. Structured-clone
  // IPC retains undefined properties, which the GPU renderer must reject.
  return cloneJson<CompositionSnapshot>({
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
          ? { kind: 'gradient', gradient: input.background.gradient }
          : input.background
            ? { kind: input.background.kind, src: input.background.path }
            : null,
    blurPercent: Math.max(0, Math.min(100, Math.round(input.blurPercent))),
    zooms: input.zooms,
    zoomMotionBlur: normalizeZoomMotionBlur(input.zoomMotionBlur),
    zoomAutoFollow: normalizeZoomAutoFollow(input.zoomAutoFollow),
    cursor: cursor
      ? {
          available: cursor.available,
          events: cursor.events,
          telemetry: cursor.telemetry,
          shapes: cursor.shapes,
          catalog: cursor.catalog ?? {},
          missing: cursor.missing,
        }
      : { available: false, events: [], telemetry: [], shapes: {}, catalog: {}, missing: [] },
    cursorSettings: {
      ...input.cursorSettings,
      motion: normalizeCursorMotionSettings(input.cursorSettings.motion),
      autoHide: normalizeCursorAutoHideSettings(input.cursorSettings.autoHide),
    },
    cursorPack: input.cursorPack,
    composition: input.composition,
    fontSources: input.fontSources ?? {},
  });
}
