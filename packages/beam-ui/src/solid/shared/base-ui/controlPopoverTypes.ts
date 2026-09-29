import type { JSX } from '@argui/solid/jsx-runtime'

export interface ControlPopoverProps {
  id?: string
  label: string
  icon: JSX.Element
  children: JSX.Element
  open: boolean
  onOpenChange: (open: boolean) => void
  disabled?: boolean
  contentWidth?: number
  contentHeight?: number
  maxContentHeight?: number
}
