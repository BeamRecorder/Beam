export interface WebcamOverlaySettings { widthPercent: number; heightPercent: number; margin: number; reactToZoom: boolean; mirror: boolean; cornerRadius: number; shadowOpacity: number }
export interface WebcamLayout { x: number; y: number; width: number; height: number }

export const DEFAULT_WEBCAM_SETTINGS: WebcamOverlaySettings = { widthPercent: 40, heightPercent: 40, margin: 24, reactToZoom: true, mirror: true, cornerRadius: 90, shadowOpacity: .67 }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
export const getWebcamZoomFactor = (appliedZoomScale: number, reactToZoom: boolean) => reactToZoom ? 1 / (Number.isFinite(appliedZoomScale) && appliedZoomScale > 0 ? appliedZoomScale : 1) : 1

export function computeWebcamLayout(canvasWidth: number, canvasHeight: number, appliedZoomScale: number, settings = DEFAULT_WEBCAM_SETTINGS): WebcamLayout {
  const margin = Math.max(0, settings.margin)
  const maximum = Math.max(56, Math.min(canvasWidth, canvasHeight) - margin * 2)
  const factor = getWebcamZoomFactor(appliedZoomScale, settings.reactToZoom)
  const dimension = (percent: number) => clamp(Math.min(canvasWidth, canvasHeight) * clamp(percent, 10, 100) / 100 * factor, 56, maximum)
  const width = dimension(settings.widthPercent)
  const height = dimension(settings.heightPercent)
  return { width, height, x: Math.max(margin, canvasWidth - width - margin), y: Math.max(margin, canvasHeight - height - margin) }
}

export function drawWebcamOverlay(ctx: CanvasRenderingContext2D, source: CanvasImageSource, canvasWidth: number, canvasHeight: number, appliedZoomScale: number, settings = DEFAULT_WEBCAM_SETTINGS) {
  const layout = computeWebcamLayout(canvasWidth, canvasHeight, appliedZoomScale, settings)
  const radius = Math.min(settings.cornerRadius, layout.width / 2, layout.height / 2)
  ctx.save()
  const shadowSize = Math.min(layout.width, layout.height)
  ctx.shadowColor = `rgba(0, 0, 0, ${settings.shadowOpacity})`
  ctx.shadowBlur = shadowSize * .22
  ctx.shadowOffsetY = shadowSize * .06
  ctx.beginPath(); ctx.roundRect(layout.x, layout.y, layout.width, layout.height, radius); ctx.clip()
  if (settings.mirror) { ctx.translate(layout.x * 2 + layout.width, 0); ctx.scale(-1, 1) }
  ctx.drawImage(source, layout.x, layout.y, layout.width, layout.height)
  ctx.restore()
}
