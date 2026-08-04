import type { ClipFrame } from '../composition-types'
import type { MediaRect } from './appearance-types'

const SAFARI_REFERENCE = { width: 1800, height: 1150, toolbarHeight: 68 }
export const normalizeFrameChromeScale = (value: number | undefined) =>
  Number.isFinite(value) ? Math.min(2, Math.max(0.5, value ?? 1)) : 1
const safariToolbarHeight = (rect: MediaRect, chromeScale = 1) =>
  Math.min(
    rect.height - 2,
    Math.max(
      18,
      ((rect.height * SAFARI_REFERENCE.toolbarHeight) / SAFARI_REFERENCE.height) *
        normalizeFrameChromeScale(chromeScale),
    ),
  )
const safariScale = (rect: MediaRect, chromeScale = 1) => {
  const scale = normalizeFrameChromeScale(chromeScale)
  const horizontalScale = Math.min(1, scale)
  const baseX = rect.width / SAFARI_REFERENCE.width
  const chromeWidth = SAFARI_REFERENCE.width * baseX * horizontalScale
  return {
    x: baseX * horizontalScale,
    y: safariToolbarHeight(rect, scale) / SAFARI_REFERENCE.toolbarHeight,
    offsetX: (rect.width - chromeWidth) / 2,
  }
}

export interface WindowsFrameOptions {
  showMenu?: boolean
  showScrollbars?: boolean
  chromeScale?: number
}

export const frameContentRect = (rect: MediaRect, frame: ClipFrame, windows: WindowsFrameOptions = {}): MediaRect => {
  if (frame === 'safari') {
    const header = safariToolbarHeight(rect, windows.chromeScale)
    return {
      x: rect.x + 1,
      y: rect.y + header,
      width: Math.max(1, rect.width - 2),
      height: Math.max(1, rect.height - header - 1),
    }
  }
  if (frame === 'windows-95') {
    const chromeScale = normalizeFrameChromeScale(windows.chromeScale)
    const scaleX = (rect.width / 800) * chromeScale,
      scaleY = (rect.height / 520) * chromeScale
    const left = Math.max(3, 12 * scaleX),
      titleHeight = Math.max(18, 31 * scaleY)
    const top = titleHeight + (windows.showMenu === false ? Math.max(3, 5 * scaleY) : Math.max(14, 35 * scaleY))
    const right = windows.showScrollbars === false ? left : Math.max(6, 30 * scaleX)
    const bottom = windows.showScrollbars === false ? Math.max(3, 12 * scaleY) : Math.max(3, 22 * scaleY)
    return {
      x: rect.x + left,
      y: rect.y + top,
      width: Math.max(1, rect.width - left - right),
      height: Math.max(1, rect.height - top - bottom),
    }
  }
  return rect
}

export const frameRadius = (frame: ClipFrame, fallback: number, rect: MediaRect) =>
  Math.min(
    frame === 'safari'
      ? Math.max(5, (rect.width * 18) / SAFARI_REFERENCE.width)
      : frame === 'windows-95'
        ? 0
        : fallback,
    rect.width / 2,
    rect.height / 2,
  )

function safariPath(ctx: CanvasRenderingContext2D, points: Array<[number, number]>, close = false) {
  ctx.beginPath()
  points.forEach(([x, y], index) => (index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
  if (close) ctx.closePath()
  ctx.stroke()
}

function drawSafariToolbar(
  ctx: CanvasRenderingContext2D,
  rect: MediaRect,
  title: string,
  paintBackground: boolean,
  chromeScale = 1,
) {
  const header = safariToolbarHeight(rect, chromeScale)
  const scale = safariScale(rect, chromeScale)
  const radius = frameRadius('safari', 0, rect)
  const x = (value: number) => rect.x + scale.offsetX + value * scale.x
  const y = (value: number) => rect.y + value * scale.y
  const line = Math.max(0.6, Math.min(scale.x, scale.y))

  if (paintBackground) {
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(rect.x, rect.y, rect.width, rect.height, radius)
    ctx.clip()
    ctx.fillStyle = '#fafafa'
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
    const background = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + header)
    background.addColorStop(0, '#fdfdfd')
    background.addColorStop(1, '#f8f8f8')
    ctx.fillStyle = background
    ctx.fillRect(rect.x, rect.y, rect.width, header)
    ctx.restore()
  }

  ctx.save()
  ctx.lineWidth = line
  ctx.strokeStyle = 'rgba(75, 75, 75, .93)'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const circle = (cx: number, color: string) => {
    ctx.beginPath()
    ctx.arc(x(cx), y(34), 7.5 * Math.min(scale.x, scale.y), 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.strokeStyle = 'rgba(0, 0, 0, .08)'
    ctx.lineWidth = 0.75 * Math.min(scale.x, scale.y)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(75, 75, 75, .93)'
    ctx.lineWidth = line
  }
  circle(31, '#ff5f57')
  circle(57, '#febc2e')
  circle(83, '#28c840')

  // left-controls: sidebar, disclosure, backward and forward placeholders
  ctx.strokeRect(x(124), y(24), 24 * scale.x, 20 * scale.y)
  safariPath(ctx, [
    [x(132), y(24)],
    [x(132), y(44)],
  ])
  safariPath(ctx, [
    [x(164), y(31)],
    [x(168), y(35)],
    [x(172), y(31)],
  ])
  safariPath(ctx, [
    [x(217), y(26)],
    [x(208), y(34)],
    [x(217), y(42)],
  ])
  safariPath(ctx, [
    [x(251), y(26)],
    [x(260), y(34)],
    [x(251), y(42)],
  ])

  // privacy-control placeholder
  ctx.fillStyle = '#505050'
  ctx.beginPath()
  ctx.moveTo(x(509), y(23))
  ctx.lineTo(x(519), y(27))
  ctx.lineTo(x(517), y(39))
  ctx.lineTo(x(509), y(45))
  ctx.lineTo(x(501), y(39))
  ctx.lineTo(x(499), y(27))
  ctx.closePath()
  ctx.fill()

  // address-bar and centered address-content
  ctx.fillStyle = '#f7f7f7'
  ctx.beginPath()
  ctx.roundRect(x(538), y(17), 726 * scale.x, 34 * scale.y, 9 * Math.min(scale.x, scale.y))
  ctx.fill()
  ctx.strokeStyle = '#d2d2d2'
  ctx.lineWidth = line
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255, 255, 255, .8)'
  safariPath(ctx, [
    [x(548), y(18.5)],
    [x(1254), y(18.5)],
  ])
  ctx.strokeStyle = '#777777'
  ctx.lineWidth = Math.max(0.6, line * 0.9)
  ctx.beginPath()
  ctx.roundRect(x(858), y(31), 10 * scale.x, 10 * scale.y, 1.5 * Math.min(scale.x, scale.y))
  ctx.stroke()
  safariPath(ctx, [
    [x(860.5), y(31)],
    [x(860.5), y(27.5)],
    [x(865), y(25.5)],
    [x(868), y(27.5)],
    [x(868), y(31)],
  ])
  const addressTitle = title || 'website.com'
  ctx.fillStyle = '#565656'
  ctx.font = `${Math.max(8, 16 * Math.min(scale.x, scale.y))}px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(addressTitle, x(876), y(34))
  ctx.strokeStyle = 'rgba(75, 75, 75, .93)'
  ctx.lineWidth = line
  ctx.beginPath()
  ctx.arc(x(1244), y(34), 8 * Math.min(scale.x, scale.y), -0.8, Math.PI * 1.45)
  ctx.stroke()
  safariPath(ctx, [
    [x(1250), y(27)],
    [x(1251), y(33)],
    [x(1245), y(31)],
  ])

  // right-controls placeholders: share, add tab, tab overview
  ctx.strokeRect(x(1662), y(28), 16 * scale.x, 15 * scale.y)
  safariPath(ctx, [
    [x(1670), y(34)],
    [x(1670), y(21)],
    [x(1666), y(25)],
  ])
  safariPath(ctx, [
    [x(1670), y(21)],
    [x(1674), y(25)],
  ])
  safariPath(ctx, [
    [x(1707), y(34)],
    [x(1725), y(34)],
  ])
  safariPath(ctx, [
    [x(1716), y(25)],
    [x(1716), y(43)],
  ])
  ctx.strokeRect(x(1755), y(25), 16 * scale.x, 15 * scale.y)
  ctx.strokeRect(x(1759), y(29), 16 * scale.x, 15 * scale.y)
  ctx.restore()

  ctx.save()
  ctx.strokeStyle = 'rgba(213, 213, 213, .75)'
  ctx.lineWidth = line
  ctx.beginPath()
  ctx.moveTo(rect.x + line / 2, rect.y + header - line / 2)
  ctx.lineTo(rect.x + rect.width - line / 2, rect.y + header - line / 2)
  ctx.stroke()
  ctx.restore()
}

function drawBevelEdges(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  raised: boolean,
) {
  ctx.fillStyle = raised ? '#ffffff' : '#808080'
  ctx.fillRect(x, y, width, 1)
  ctx.fillRect(x, y, 1, height)
  ctx.fillStyle = raised ? '#808080' : '#ffffff'
  ctx.fillRect(x, y + height - 1, width, 1)
  ctx.fillRect(x + width - 1, y, 1, height)
  ctx.fillStyle = raised ? '#dfdfdf' : '#404040'
  ctx.fillRect(x + 1, y + 1, Math.max(0, width - 2), 1)
  ctx.fillRect(x + 1, y + 1, 1, Math.max(0, height - 2))
}

function drawBevel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  raised: boolean,
  color: string,
) {
  ctx.fillStyle = color
  ctx.fillRect(x, y, width, height)
  drawBevelEdges(ctx, x, y, width, height, raised)
}

function drawOuterWindowsBevel(ctx: CanvasRenderingContext2D, rect: MediaRect) {
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(rect.x, rect.y, rect.width, 1)
  ctx.fillRect(rect.x, rect.y, 1, rect.height)
  ctx.fillStyle = '#dfdfdf'
  ctx.fillRect(rect.x + 1, rect.y + 1, Math.max(0, rect.width - 3), 1)
  ctx.fillRect(rect.x + 1, rect.y + 1, 1, Math.max(0, rect.height - 3))
  ctx.fillStyle = '#000000'
  ctx.fillRect(rect.x, rect.y + rect.height - 1, rect.width, 1)
  ctx.fillRect(rect.x + rect.width - 1, rect.y, 1, rect.height)
  ctx.fillStyle = '#808080'
  ctx.fillRect(rect.x + 1, rect.y + rect.height - 2, Math.max(0, rect.width - 3), 1)
  ctx.fillRect(rect.x + rect.width - 2, rect.y + 1, 1, Math.max(0, rect.height - 3))
}

function drawWindows95Frame(
  ctx: CanvasRenderingContext2D,
  rect: MediaRect,
  title: string,
  paintBackground: boolean,
  color: string,
  windows: WindowsFrameOptions,
) {
  const chromeScale = normalizeFrameChromeScale(windows.chromeScale)
  const sx = (rect.width / 800) * chromeScale
  const sy = (rect.height / 520) * chromeScale
  const px = (value: number) => rect.x + Math.round(value * sx)
  const py = (value: number) => rect.y + Math.round(value * sy)
  const content = frameContentRect(rect, 'windows-95', windows)
  if (paintBackground) {
    ctx.fillStyle = color
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
  }
  drawOuterWindowsBevel(ctx, rect)
  const titleX = px(3),
    titleY = py(3),
    titleRight = rect.x + rect.width - Math.max(3, Math.round(3 * chromeScale)),
    titleW = Math.max(1, titleRight - titleX),
    titleH = Math.max(18, py(31) - titleY)
  ctx.fillStyle = '#000080'
  ctx.fillRect(titleX, titleY, titleW, titleH)
  ctx.fillStyle = '#ffffff'
  ctx.font = `${Math.max(9, Math.round(16 * Math.min(sx, sy)))}px "MS Sans Serif", "Microsoft Sans Serif", Tahoma, sans-serif`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(title, px(16), titleY + titleH / 2)
  const buttonSize = Math.max(12, Math.round(18 * Math.min(sx, sy)))
  const buttonY = titleY + Math.max(1, Math.round(4 * sy))
  ;[3, 2, 1].forEach((offset, index) => {
    const buttonX =
      rect.x +
      rect.width -
      Math.max(3, Math.round(6 * chromeScale)) -
      buttonSize -
      Math.round((offset - 1) * 19 * chromeScale)
    drawBevel(ctx, buttonX, buttonY, buttonSize, buttonSize, true, color)
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 1
    if (index === 0) {
      ctx.beginPath()
      ctx.moveTo(buttonX + 5, buttonY + buttonSize - 5)
      ctx.lineTo(buttonX + buttonSize - 5, buttonY + buttonSize - 5)
      ctx.stroke()
    } else if (index === 1)
      ctx.strokeRect(buttonX + 5, buttonY + 5, Math.max(2, buttonSize - 10), Math.max(2, buttonSize - 10))
    else {
      ctx.beginPath()
      ctx.moveTo(buttonX + 5, buttonY + 5)
      ctx.lineTo(buttonX + buttonSize - 5, buttonY + buttonSize - 5)
      ctx.moveTo(buttonX + buttonSize - 5, buttonY + 5)
      ctx.lineTo(buttonX + 5, buttonY + buttonSize - 5)
      ctx.stroke()
    }
  })
  if (windows.showMenu !== false) {
    const menuY = py(31),
      menuH = Math.max(14, py(65) - menuY)
    ctx.fillStyle = color
    ctx.fillRect(titleX, menuY, titleW, menuH)
    ctx.fillStyle = '#000000'
    ctx.font = `${Math.max(8, Math.round(14 * Math.min(sx, sy)))}px "MS Sans Serif", sans-serif`
    ctx.textBaseline = 'middle'
    ctx.fillText('File', px(12), menuY + menuH / 2)
    ctx.fillText('Edit', px(54), menuY + menuH / 2)
    ctx.fillText('Search', px(94), menuY + menuH / 2)
  }
  const clientX = content.x - 2,
    clientY = content.y - 2,
    clientW = content.width + 4,
    clientH = content.height + 4
  if (paintBackground) drawBevel(ctx, clientX, clientY, clientW, clientH, false, '#ffffff')
  else drawBevelEdges(ctx, clientX, clientY, clientW, clientH, false)
  if (windows.showScrollbars !== false) {
    const scrollbar = Math.max(12, Math.round(18 * Math.min(sx, sy)))
    const verticalX = rect.x + rect.width - scrollbar - Math.max(2, Math.round(4 * sx))
    const horizontalY = rect.y + rect.height - scrollbar - Math.max(2, Math.round(4 * sy))
    drawBevel(ctx, verticalX, content.y, scrollbar, scrollbar, true, color)
    drawBevel(
      ctx,
      verticalX,
      rect.y + rect.height - scrollbar * 2 - Math.max(2, Math.round(4 * sy)),
      scrollbar,
      scrollbar,
      true,
      color,
    )
    ctx.fillStyle = color
    ctx.fillRect(verticalX, content.y + scrollbar, scrollbar, Math.max(1, horizontalY - content.y - scrollbar))
    drawBevel(
      ctx,
      verticalX + 2,
      content.y + scrollbar + 8,
      Math.max(1, scrollbar - 4),
      Math.max(12, Math.round(48 * sy)),
      true,
      color,
    )
    drawBevel(ctx, content.x, horizontalY, scrollbar, scrollbar, true, color)
    drawBevel(ctx, verticalX - scrollbar, horizontalY, scrollbar, scrollbar, true, color)
    ctx.fillStyle = color
    ctx.fillRect(content.x + scrollbar, horizontalY, Math.max(1, verticalX - content.x - scrollbar), scrollbar)
    drawBevel(
      ctx,
      content.x + scrollbar + 8,
      horizontalY + 2,
      Math.max(12, Math.round(72 * sx)),
      Math.max(1, scrollbar - 4),
      true,
      color,
    )
    ctx.fillStyle = color
    ctx.fillRect(verticalX, horizontalY, scrollbar, scrollbar)
    ctx.strokeStyle = '#808080'
    ctx.lineWidth = 1
    for (let i = 0; i < 3; i += 1) {
      const offset = 5 + i * 4
      ctx.beginPath()
      ctx.moveTo(verticalX + offset, horizontalY + scrollbar - 3)
      ctx.lineTo(verticalX + scrollbar - 3, horizontalY + offset)
      ctx.stroke()
    }
  }
}

export function drawFrameChrome(
  ctx: CanvasRenderingContext2D,
  rect: MediaRect,
  frame: ClipFrame,
  title: string,
  paintBackground = true,
  frameColor = '#c0c0c0',
  windows: WindowsFrameOptions = {},
) {
  if (frame === 'none') return
  if (frame === 'safari') {
    drawSafariToolbar(ctx, rect, title, paintBackground, windows.chromeScale)
    ctx.save()
    ctx.strokeStyle = 'rgba(169, 169, 169, .75)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(
      rect.x + 0.5,
      rect.y + 0.5,
      Math.max(0, rect.width - 1),
      Math.max(0, rect.height - 1),
      frameRadius(frame, 0, rect),
    )
    ctx.stroke()
    ctx.restore()
    return
  }
  drawWindows95Frame(ctx, rect, title, paintBackground, frameColor, windows)
}
