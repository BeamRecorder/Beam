import type { JSX } from '@argui/solid/jsx-runtime'
import type { BeamApi } from '../shared/beamApi'
import type { TeleprompterDocument } from './teleprompterTypes'

export type TeleprompterControl = 'speed' | 'font' | 'color' | 'opacity'

export interface TeleprompterProps {
  api: BeamApi
}

export interface TeleprompterToolbarProps {
  document: TeleprompterDocument
  ready: boolean
  playing: boolean
  pending: boolean
  error: string
  onCopyError: (text: string) => Promise<void>
  onUpdate: (patch: Partial<TeleprompterDocument>) => void
  onPreview: () => void
  viewportHeight: number
  onPopoverOpenChange: (open: boolean) => void
}

export interface TeleprompterSurfaceProps {
  api: BeamApi
  opacity: number
  children: JSX.Element
}
