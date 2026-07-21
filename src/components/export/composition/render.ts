import { zoomAtTime } from '../../video-editor/zoom/zoom-playback'
import { cursorStateAt } from '../../video-editor/composables/cursorPlayback'
import type { CompositionSnapshot } from '../export-types'

export function renderCompositionFrame(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, snapshot: CompositionSnapshot, time: number, background?: CanvasImageSource | null, cursorImages?: ReadonlyMap<string, HTMLImageElement>) {
  const { width, height } = snapshot.video
  ctx.fillStyle = '#1e1e24'
  ctx.fillRect(0, 0, width, height)
  if (background) ctx.drawImage(background, 0, 0, width, height)
  if (!snapshot.video.enabled || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return
  const zoom = zoomAtTime(snapshot.zooms, time * 1000, snapshot.cursor.telemetry)
  const scale = zoom?.scale ?? 1
  const focus = zoom?.focus ?? { cx: 0.5, cy: 0.5 }
  ctx.save()
  ctx.translate(width / 2, height / 2)
  ctx.scale(scale, scale)
  ctx.translate(-focus.cx * width, -focus.cy * height)
  ctx.drawImage(video, 0, 0, width, height)
  const cursor = cursorStateAt(snapshot.cursor.events, time)
  const image = cursor?.shapeId ? cursorImages?.get(cursor.shapeId) : undefined
  if (cursor?.visible && image?.complete && image.naturalWidth > 0) {
    const hotspot = snapshot.cursor.shapes[cursor.shapeId!]?.hotspot ?? { x: 0, y: 0 }
    const scale = 32 / image.naturalWidth
    ctx.drawImage(image, cursor.x * width - hotspot.x * scale, cursor.y * height - hotspot.y * scale, image.naturalWidth * scale, image.naturalHeight * scale)
  }
  ctx.restore()
}
