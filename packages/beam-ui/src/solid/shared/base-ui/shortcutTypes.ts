import type { NativeEventPayload } from '@argui/host'

export type ShortcutKeyEvent = NativeEventPayload<'key'>
export interface ShortcutFieldProps {
  label: string
  value: string
  disabled?: boolean
  onChange: (value: string) => Promise<boolean>
  onCaptureChange?: (capturing: boolean) => void
}
