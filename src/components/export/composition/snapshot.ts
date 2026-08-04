import type { ProjectEditorData } from '../../../api/types/capture-api'
import type { BackgroundValue } from '../../video-editor/composables/backgroundCatalog'
import type { ZoomElement } from '../../video-editor/zoom/zoom-types'
import type { ClipComposition, VisualClip } from '../../video-editor/composition/composition-types'
import type { CursorRenderSettings, CompositionSnapshot } from '../export-types'
import type { OutputCanvasSettings } from '../../video-editor/canvas/output-canvas'
import { normalizeOutputCanvas } from '../../video-editor/canvas/output-canvas'
import { tNamespace } from '../../../i18n'
import { normalizeCursorMotionSettings } from '../../../api/types/cursor-settings'

const $t = tNamespace('exporter')
const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const copyZooms = (zooms: readonly ZoomElement[]) => zooms.map((zoom) => ({ ...zoom, focus: { ...zoom.focus } }))
const copyCursor = (cursor: ProjectEditorData['cursor'] | undefined): CompositionSnapshot['cursor'] => {
  if (!cursor) return { available: false, events: [], telemetry: [], shapes: {}, catalog: {}, missing: [] }
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
  }
}

export function createCompositionSnapshot(input: {
  duration: number
  width: number
  height: number
  fps: number
  canvas: OutputCanvasSettings
  background: BackgroundValue | null
  blurPercent: number
  editorData: ProjectEditorData | null | undefined
  zooms: ZoomElement[]
  composition: ClipComposition
  cursorSettings: CursorRenderSettings
}): CompositionSnapshot {
  const screen = input.composition.clips.find((clip): clip is VisualClip => clip.kind === 'screen' && clip.enabled)
  const asset = screen && input.composition.assets.find((entry) => entry.id === screen.assetId)
  if (!screen || !asset?.src) throw new Error($t('sessionVideoUnavailable'))
  const canvas = normalizeOutputCanvas(input.canvas)
  return {
    duration: Math.max(0, input.duration),
    render: {
      fps: Math.max(1, input.fps),
      sourceWidth: Math.max(1, asset.width ?? input.width),
      sourceHeight: Math.max(1, asset.height ?? input.height),
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
  }
}
