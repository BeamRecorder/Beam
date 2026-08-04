import { ref, watch } from 'vue'
import type { ProjectEditorData } from '~/api/types/capture-session'
import { buttonEventsBetween, cursorStateAt } from '../../composables/cursorPlayback'
import { type CursorType, useCursorReplacer } from '../../properties/cursor/useCursorReplacer'
import { ZOOM_DEPTH_SCALES } from '../../zoom/zoom-types'
import { cursorClickSpringScale } from '../../composables/cursor-click-spring'
import { cursorShadowOffset } from '../../properties/cursor/cursor-shadow'
import type { ShadowDirection } from '../../properties/cursor/shadow-types'
import { cursorHotspotAtSize, cursorPositionAt, cursorTypeAt } from '../../properties/cursor/cursor-rendering'
import type { VisualClip } from '../../composition/composition-types'
import { createCursorMotionPlayer, motionBlurTrail } from '../../composables/cursor-motion'
import {
  effectButtonForRecordedButton,
  type CursorClickEffectSettings,
  type CursorClickEffects,
  type CursorMotionSettings,
} from '../../../../api/types/cursor-settings'
import type { OutputCanvasSettings } from '../output-canvas'

export interface Ripple {
  x: number
  y: number
  radius: number
  alpha: number
  color: string
  size: number
}

export interface UseCursorOverlayOptions {
  selectedCursor: () => CursorType
  cursorSize: () => number
  cursorColor: () => string
  enableShadow: () => boolean
  clickEffects: () => CursorClickEffects
  motion: () => CursorMotionSettings
  shadowBlur: () => number
  shadowColor: () => string
  shadowDirection: () => ShadowDirection
  outputCanvas: () => OutputCanvasSettings
  deviceScale: () => number
  currentTime: () => number
  isPlaying: () => boolean
  editorData: () => ProjectEditorData | null | undefined
  screenClip: () => VisualClip | null
  isScreenEnabled: () => boolean
  showBackground: () => boolean
  onRenderOnce?: () => void
}

export const getRippleStyleColor = (hex: string, alpha: number) => {
  if (!hex.startsWith('#')) return hex
  const r = Number.parseInt(hex.slice(1, 3), 16) || 0
  const g = Number.parseInt(hex.slice(3, 5), 16) || 0
  const b = Number.parseInt(hex.slice(5, 7), 16) || 0
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function useCursorOverlay(options: UseCursorOverlayOptions) {
  const { getCursorImage } = useCursorReplacer()
  const customCursorImage = ref<HTMLImageElement | null>(null)
  const ripples = ref<Ripple[]>([])
  let lastDrawTime = 0
  let motionPlayer: ReturnType<typeof createCursorMotionPlayer> | null = null
  let motionPlayerEvents: ProjectEditorData['cursor']['events'] | null = null
  let motionPlayerKey = ''
  const maxZoomScale = Math.max(...Object.values(ZOOM_DEPTH_SCALES))

  watch(
    () =>
      [
        options.selectedCursor(),
        options.currentTime(),
        options.cursorSize(),
        options.cursorColor(),
        options.deviceScale(),
      ] as const,
    async () => {
      try {
        const state = cursorStateAt(options.editorData()?.cursor.events ?? [], options.currentTime())
        customCursorImage.value = await getCursorImage(
          cursorTypeAt(options.selectedCursor(), state),
          options.cursorSize() * maxZoomScale * options.deviceScale(),
          options.cursorColor(),
        )
        options.onRenderOnce?.()
      } catch (error) {
        console.error('Failed to load custom cursor image:', error)
        customCursorImage.value = null
      }
    },
    { immediate: true },
  )

  const warning = (ctx: CanvasRenderingContext2D, message: string, width: number) => {
    ctx.save()
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillStyle = 'rgba(15,23,42,.82)'
    const padding = 8
    const textWidth = ctx.measureText(message).width
    ctx.roundRect(width - textWidth - padding * 2 - 8, 12, textWidth + padding * 2, 26, 6)
    ctx.fill()
    ctx.fillStyle = '#fbbf24'
    ctx.fillText(message, width - 8 - padding, 29)
    ctx.restore()
  }

  const positionAt = (
    state: NonNullable<ReturnType<typeof cursorStateAt>>,
    videoWindow: { dx: number; dy: number; dw: number; dh: number },
    videoWidth: number,
    videoHeight: number,
  ) => {
    const screen = options.screenClip()
    return cursorPositionAt(
      state,
      { width: videoWidth || 1920, height: videoHeight || 1080 },
      { x: videoWindow.dx, y: videoWindow.dy, width: videoWindow.dw, height: videoWindow.dh },
      options.showBackground(),
      screen?.transform ?? { x: 0, y: 0, width: 1, height: 1 },
      screen?.isMirrored ?? false,
      screen?.isMirroredY ?? false,
      screen?.appearance,
      screen?.crop,
    )
  }

  const settingsForButton = (button: number): CursorClickEffectSettings | null => {
    const effectButton = effectButtonForRecordedButton(button)
    return effectButton ? options.clickEffects()[effectButton] : null
  }

  const previewScaleFor = (videoWindow: { dw: number; dh: number }) =>
    Math.min(
      videoWindow.dw / Math.max(1, options.outputCanvas().width),
      videoWindow.dh / Math.max(1, options.outputCanvas().height),
    )

  const playerFor = (events: ProjectEditorData['cursor']['events'], videoWidth: number, videoHeight: number) => {
    const motion = options.motion()
    const key = `${events.length}:${events.at(-1)?.sessionNs ?? 0}:${videoWidth}:${videoHeight}:${motion.preset}:${motion.smoothing}:${motion.springMassMultiplier}:${motion.motionBlur}`
    if (!motionPlayer || motionPlayerEvents !== events || motionPlayerKey !== key) {
      motionPlayer = createCursorMotionPlayer(events, motion, videoWidth || 1920, videoHeight || 1080)
      motionPlayerEvents = events
      motionPlayerKey = key
    }
    return motionPlayer
  }

  const updateAndDrawRipplesAndCursor = (
    ctx: CanvasRenderingContext2D,
    videoWindow: { dx: number; dy: number; dw: number; dh: number; focusX: number; focusY: number; scale: number },
    videoWidth: number,
    videoHeight: number,
    logicalWidth: number,
    drawInCameraSpace: (drawContent: () => void) => void,
  ) => {
    const cursorData = options.editorData()?.cursor
    if (!cursorData?.available) {
      if (options.isScreenEnabled() && cursorData && !cursorData.available)
        warning(ctx, 'Cursor data missing', logicalWidth)
      return
    }
    const time = options.currentTime()
    const playing = options.isPlaying()
    const player = playerFor(cursorData.events, videoWidth, videoHeight)
    if (time < lastDrawTime) {
      player.reset()
      ripples.value = []
    }
    if (playing && time >= lastDrawTime) {
      for (const button of buttonEventsBetween(cursorData.events, lastDrawTime, time)) {
        const effect = settingsForButton(button.button)
        if (!effect?.rippleEnabled) continue
        const state = cursorStateAt(cursorData.events, button.sessionNs / 1_000_000_000)
        if (!state) continue
        const target = player.timeline.targetAt(button.sessionNs / 1_000_000_000)
        const position = positionAt(
          target ? { ...state, x: target.x, y: target.y } : state,
          videoWindow,
          videoWidth,
          videoHeight,
        )
        ripples.value.push({
          x: position.x,
          y: position.y,
          radius: 2,
          alpha: 1,
          color: effect.rippleColor,
          size: effect.rippleSize,
        })
      }
    }
    lastDrawTime = time
    const state = cursorStateAt(cursorData.events, time)
    const motionState = player.sample(time, state)
    if (options.selectedCursor() === 'automatic' && state?.cursorKind === 'custom')
      warning(ctx, 'System cursor not translated', logicalWidth)

    drawInCameraSpace(() => {
      const previewScale = previewScaleFor(videoWindow)
      for (const ripple of ripples.value) {
        ctx.strokeStyle = getRippleStyleColor(ripple.color, ripple.alpha)
        ctx.lineWidth = Math.max(1, 3 * previewScale)
        ctx.beginPath()
        ctx.arc(ripple.x, ripple.y, ripple.radius * previewScale, 0, Math.PI * 2)
        ctx.stroke()
        if (playing) {
          ripple.radius += ripple.size / 25
          ripple.alpha -= 0.04
        }
      }
      const image = customCursorImage.value
      if (!state?.visible || !image?.complete || image.naturalWidth <= 0) return
      if (!motionState) return
      const size = options.cursorSize() * previewScale
      const hotspot = cursorHotspotAtSize(cursorTypeAt(options.selectedCursor(), motionState), size)
      const click = buttonEventsBetween(cursorData.events, Math.max(0, time - 0.28), time)
        .reverse()
        .find((event) => settingsForButton(event.button)?.springEnabled)
      const age = click ? Math.max(0, time - click.sessionNs / 1_000_000_000) : Infinity
      const spring = click ? settingsForButton(click.button) : null
      const scale = cursorClickSpringScale(age, Boolean(spring?.springEnabled), spring?.springIntensity ?? 0)
      const trail = motionBlurTrail(
        { x: motionState.x, y: motionState.y },
        { x: motionState.previousX, y: motionState.previousY },
        motionState.deltaSeconds,
        options.motion().motionBlur,
        { width: videoWindow.dw, height: videoWindow.dh },
      )
      for (const sample of trail) {
        const sampleState = { ...motionState, x: sample.x, y: sample.y }
        const samplePosition = positionAt(sampleState, videoWindow, videoWidth, videoHeight)
        ctx.save()
        ctx.globalAlpha = sample.alpha
        if (options.enableShadow()) {
          ctx.shadowColor = options.shadowColor()
          const shadowBlur = options.shadowBlur() * previewScale
          ctx.shadowBlur = shadowBlur
          const offset = cursorShadowOffset(shadowBlur, options.shadowDirection())
          ctx.shadowOffsetX = offset.x
          ctx.shadowOffsetY = offset.y
        }
        ctx.translate(samplePosition.x, samplePosition.y)
        ctx.scale(scale, scale)
        ctx.drawImage(image, -hotspot.x, -hotspot.y, size, size)
        ctx.restore()
      }
    })
    ripples.value = ripples.value.filter((ripple) => ripple.alpha > 0)
  }

  return { customCursorImage, ripples, updateAndDrawRipplesAndCursor }
}
