import type { CursorPlaybackState } from '../../composables/cursorPlayback'
import { outputPoint, type CanvasRect } from '../../canvas/output-canvas'
import type { NormalizedTransform } from '../../composition/composition-types'
import { cursorTypeForKind, type CursorType } from './useCursorReplacer'

export const CURSOR_REFERENCE_SIZE = 32

export const cursorHotspots: Record<CursorType, { x: number; y: number }> = {
  automatic: { x: 0, y: 0 }, default: { x: 10, y: 7 }, beachball: { x: 16, y: 16 }, busy: { x: 7, y: 0 }, cell: { x: 16, y: 16 }, contextualmenu: { x: 8, y: 7 }, copy: { x: 7, y: 0 }, cross: { x: 16, y: 16 }, handgrabbing: { x: 16, y: 16 }, handopen: { x: 16, y: 16 }, handpointing: { x: 12, y: 10 }, help: { x: 7, y: 0 }, makealias: { x: 7, y: 0 }, move: { x: 16, y: 16 }, notallowed: { x: 7, y: 0 }, poof: { x: 7, y: 0 }, resizenorth: { x: 16, y: 16 }, resizenortheast: { x: 16, y: 16 }, resizenortheastsouthwest: { x: 16, y: 16 }, resizenorthsouth: { x: 16, y: 16 }, resizenorthwest: { x: 16, y: 16 }, resizenorthwestsoutheast: { x: 16, y: 16 }, resizeright: { x: 16, y: 16 }, resizesouth: { x: 16, y: 16 }, resizesoutheast: { x: 16, y: 16 }, resizesouthwest: { x: 16, y: 16 }, resizeup: { x: 16, y: 16 }, resizeupdown: { x: 16, y: 16 }, resizewest: { x: 16, y: 16 }, resizewesteast: { x: 16, y: 16 }, screenshotselection: { x: 16, y: 16 }, screenshotwindow: { x: 16, y: 16 }, textcursor: { x: 16, y: 16 }, textcursorvertical: { x: 16, y: 16 }, zoomin: { x: 16, y: 16 }, zoomout: { x: 16, y: 16 },
}

export const cursorTypeAt = (selectedCursor: CursorType, state: CursorPlaybackState | null): CursorType =>
  selectedCursor === 'automatic' ? cursorTypeForKind(state?.cursorKind) : selectedCursor

export const cursorHotspotAtSize = (type: CursorType, size: number) => {
  const scale = size / CURSOR_REFERENCE_SIZE
  const hotspot = cursorHotspots[type]
  return { x: hotspot.x * scale, y: hotspot.y * scale }
}

export function cursorPositionAt(
  state: CursorPlaybackState,
  source: { width: number; height: number },
  viewport: CanvasRect,
  showBackground: boolean,
  transform: NormalizedTransform = { x: 0, y: 0, width: 1, height: 1 },
  mirrored = false,
  mirroredY = false,
) {
  const point = outputPoint(
    Math.max(0, Math.min(1, state.x)),
    Math.max(0, Math.min(1, state.y)),
    source.width,
    source.height,
    viewport.width,
    viewport.height,
    showBackground,
  )
  const x = mirrored ? 1 - point.cx : point.cx
  const y = mirroredY ? 1 - point.cy : point.cy
  return {
    x: viewport.x + (x * transform.width + transform.x) * viewport.width,
    y: viewport.y + (y * transform.height + transform.y) * viewport.height,
  }
}
