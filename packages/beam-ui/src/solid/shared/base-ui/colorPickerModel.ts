import type { BrushValue } from '@argui/host'
import type { HsvaColor } from './colorPickerTypes'

export const clampColorChannel = (value: number, maximum = 1): number => Math.max(0, Math.min(maximum, value))
const byteHex = (value: number): string => Math.round(clampColorChannel(value) * 255).toString(16).padStart(2, '0')

/** Parses the hexadecimal formats accepted by the picker without replacing invalid input. */
export function parseHexColor(value: string): HsvaColor | undefined {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value.trim())
  if (!match) return undefined
  const digits = match[1]!.length <= 4 ? [...match[1]!].map(channel => channel + channel).join('') : match[1]!
  const red = parseInt(digits.slice(0, 2), 16) / 255
  const green = parseInt(digits.slice(2, 4), 16) / 255
  const blue = parseInt(digits.slice(4, 6), 16) / 255
  const brightness = Math.max(red, green, blue)
  const difference = brightness - Math.min(red, green, blue)
  const segment = difference === 0 ? 0 : brightness === red
    ? (green - blue) / difference : brightness === green ? (blue - red) / difference + 2 : (red - green) / difference + 4
  return {
    hue: ((segment * 60) % 360 + 360) % 360,
    saturation: brightness === 0 ? 0 : difference / brightness,
    brightness,
    alpha: digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1,
  }
}

/** Converts normalized HSV channels and alpha into the persisted eight-digit hexadecimal format. */
export function hsvaToHex(color: HsvaColor): string {
  const hue = ((color.hue % 360) + 360) % 360 / 60
  const saturation = clampColorChannel(color.saturation)
  const brightness = clampColorChannel(color.brightness)
  const chroma = brightness * saturation
  const secondary = chroma * (1 - Math.abs(hue % 2 - 1))
  const channels = hue < 1 ? [chroma, secondary, 0] : hue < 2 ? [secondary, chroma, 0]
    : hue < 3 ? [0, chroma, secondary] : hue < 4 ? [0, secondary, chroma]
      : hue < 5 ? [secondary, 0, chroma] : [chroma, 0, secondary]
  const minimum = brightness - chroma
  return `#${channels.map(channel => byteHex(channel + minimum)).join('')}${byteHex(color.alpha)}`
}

/** Replaces alpha in native hex, rgb or oklch theme colors. */
export function colorWithOpacity(color: string, opacity: number): string {
  const alpha = clampColorChannel(opacity)
  const parsed = parseHexColor(color)
  if (parsed) return hsvaToHex({ ...parsed, alpha })
  const oklch = /^oklch\(([^)]+)\)$/.exec(color)
  if (oklch) return `oklch(${oklch[1]!.split('/')[0]!.trim()} / ${alpha})`
  const rgb = /^rgba?\(([^)]+)\)$/.exec(color)
  if (rgb) {
    const channels = rgb[1]!.split('/')[0]!.trim().split(/[,\s]+/).slice(0, 3)
    return `rgba(${channels.join(',')},${alpha})`
  }
  throw new Error(`Unsupported native color: ${color}`)
}

/** Stable GPU-shaded hue spectrum used by the hue control and color trigger. */
export const hueSpectrum: BrushValue = {
  kind: 'linear', angle: 0, space: 'srgb', stops: [
    { offset: 0, color: '#ff0000' }, { offset: 1 / 6, color: '#ffff00' },
    { offset: 2 / 6, color: '#00ff00' }, { offset: 3 / 6, color: '#00ffff' },
    { offset: 4 / 6, color: '#0000ff' }, { offset: 5 / 6, color: '#ff00ff' },
    { offset: 1, color: '#ff0000' },
  ],
}
