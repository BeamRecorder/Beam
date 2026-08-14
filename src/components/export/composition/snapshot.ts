import type { ProjectEditorData } from '../../../api/types/capture-api';
import type { BackgroundValue } from '../../video-editor/composables/backgroundCatalog';
import type { ZoomElement } from '../../video-editor/zoom/zoom-types';
import { isVisualClip, type ClipComposition, type VisualClip } from '~/media/shared/composition-types';
import type { CursorRenderSettings, CompositionSnapshot } from '../export-types';
import type { OutputCanvasSettings } from '../../video-editor/canvas/output-canvas';
import { normalizeOutputCanvas } from '../../video-editor/canvas/output-canvas';
import { normalizeCursorMotionSettings } from '../../../api/types/cursor-settings';

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
  width: number;
  height: number;
  fps: number;
  canvas: OutputCanvasSettings;
  background: BackgroundValue | null;
  blurPercent: number;
  editorData: ProjectEditorData | null | undefined;
  zooms: ZoomElement[];
  composition: ClipComposition;
  cursorSettings: CursorRenderSettings;
}): CompositionSnapshot {
  const assets = new Map(input.composition.assets.map((asset) => [asset.id, asset]));
  const visualClips = input.composition.clips.filter(
    (clip): clip is VisualClip => isVisualClip(clip) && clip.enabled && Boolean(assets.get(clip.assetId)?.src),
  );
  const referenceClip = visualClips.find((clip) => clip.kind === 'screen') ?? visualClips[0];
  const referenceAsset = referenceClip ? assets.get(referenceClip.assetId) : null;
  const canvas = normalizeOutputCanvas(input.canvas);
  return {
    duration: Math.max(0, input.duration),
    render: {
      fps: Math.max(1, input.fps),
      sourceWidth: Math.max(1, referenceAsset?.width ?? input.width),
      sourceHeight: Math.max(1, referenceAsset?.height ?? input.height),
    },
    canvas,
    background:
      input.background?.kind === 'color'
        ? { kind: 'color', color: input.background.color }
        : input.background?.kind === 'gradient'
          ? { kind: 'gradient', gradient: cloneJson(input.background.gradient) }
          : input.background
            ? { kind: input.background.kind, src: input.background.path }
            : null,
    blurPercent: Math.max(0, Math.min(100, Math.round(input.blurPercent))),
    zooms: copyZooms(input.zooms),
    cursor: copyCursor(input.editorData?.cursor),
    cursorSettings: cloneJson({
      ...input.cursorSettings,
      motion: normalizeCursorMotionSettings(input.cursorSettings.motion),
    }),
    composition: cloneJson(input.composition),
  };
}
