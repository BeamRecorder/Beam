import type { BrushValue } from '@argui/host'

export interface HsvaColor {
  hue: number
  saturation: number
  brightness: number
  alpha: number
}

export interface ColorPickerLabels {
  pad: string
  hue: string
  opacity: string
  saturation: string
  brightness: string
  hex: string
  invalid: string
}

export interface ColorPickerProps {
  /** A hexadecimal color: #RGB, #RGBA, #RRGGBB or #RRGGBBAA. */
  value: string
  /** Emits normalized #RRGGBBAA, including the selected opacity. */
  onValueChange: (value: string) => void
  labels: ColorPickerLabels
  /** Resolved content width, keeping drag geometry independent of layout updates. */
  width?: number
  disabled?: boolean
}

export interface ColorChannelSliderProps {
  width: number
  label: string
  value: number
  max: number
  step?: number
  background: BrushValue
  checkerboard?: boolean
  disabled?: boolean
  onValueChange: (value: number) => void
  onValueCommit?: () => void
}

export interface ColorPadProps {
  width: number
  color: HsvaColor
  label: string
  valueDescription: string
  disabled?: boolean
  onValueChange: (saturation: number, brightness: number) => void
  onValueCommit?: () => void
}
