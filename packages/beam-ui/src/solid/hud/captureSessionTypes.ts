import type { RecordingStatus } from '../shared/beamTypes'

export type PreparedCapture = { status: RecordingStatus } | { cause: unknown }
export interface CaptureRun {
  canceled: boolean
  preparing: Promise<RecordingStatus>
  prepared: Promise<PreparedCapture>
  elapsed: Promise<void>
  finishCountdown: () => void
  operation?: Promise<unknown>
  timer?: ReturnType<typeof setInterval>
}
export type CaptureOperation = () => Promise<unknown>
