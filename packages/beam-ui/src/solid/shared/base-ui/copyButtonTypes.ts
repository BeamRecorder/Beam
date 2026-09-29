import type { Accessor } from 'solid-js'

export interface CopyButtonProps {
  value: string
  onCopy: (text: string) => Promise<void>
  label: string
  copiedLabel: string
  errorLabel: string
}

export interface CopyTextState {
  pending: Accessor<boolean>
  copied: Accessor<boolean>
  error: Accessor<string>
  copy: () => Promise<void>
}
