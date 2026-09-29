import type { JSX } from '@argui/solid/jsx-runtime'
import type { ControlPopoverProps } from './controlPopoverTypes'

export interface SliderPopoverProps extends Omit<ControlPopoverProps, 'children'> {
  value: number
  min: number
  max: number
  step?: number
  formatValue?: (value: number) => string
  onValueChange: (value: number) => void
  children?: JSX.Element
}
