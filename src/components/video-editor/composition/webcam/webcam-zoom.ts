import type { WebcamAppearance } from '../composition-types'

export interface WebcamOverlaySettings { widthPercent: number; heightPercent: number; margin: number; reactToZoom: boolean; mirror: boolean; cornerRadius: number; shadowOpacity: number }
export interface WebcamLayout { x: number; y: number; width: number; height: number }

export const DEFAULT_WEBCAM_SETTINGS: WebcamOverlaySettings = { widthPercent: 40, heightPercent: 40, margin: 24, reactToZoom: true, mirror: true, cornerRadius: 14, shadowOpacity: .42 }

const cornerRadii = { none: 0, sm: 8, md: 14, lg: 22, full: Number.MAX_SAFE_INTEGER }
const shadowOpacities = { none: 0, sm: .28, md: .42, lg: .58 }
export function webcamSettingsForAppearance(appearance: WebcamAppearance | undefined): WebcamOverlaySettings {
  if (!appearance) return DEFAULT_WEBCAM_SETTINGS
  return { ...DEFAULT_WEBCAM_SETTINGS, cornerRadius: cornerRadii[appearance.cornerRadius], shadowOpacity: shadowOpacities[appearance.shadowSize] }
}

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
  const shadowSize = Math.min(layout.width, layout.height)

  if (settings.shadowOpacity > 0) {
    ctx.save()
    ctx.globalAlpha = .01
    ctx.fillStyle = '#000000'
    ctx.shadowColor = `rgba(0, 0, 0, ${settings.shadowOpacity})`
    ctx.shadowBlur = shadowSize * .22
    ctx.shadowOffsetY = shadowSize * .06
    ctx.beginPath(); ctx.roundRect(layout.x, layout.y, layout.width, layout.height, radius); ctx.fill()
    ctx.restore()
  }

  ctx.save()
  ctx.beginPath(); ctx.roundRect(layout.x, layout.y, layout.width, layout.height, radius); ctx.clip()
  if (settings.mirror) { ctx.translate(layout.x * 2 + layout.width, 0); ctx.scale(-1, 1) }
  ctx.drawImage(source, layout.x, layout.y, layout.width, layout.height)
  ctx.restore()
}
