import { capture } from './capture'

/** Native camera preview uses a local stream served by the Rust pipeline. */
export function isCameraUnavailableError(error: unknown) {
  const name = typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : ''
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  return ['NotFoundError', 'NotReadableError', 'OverconstrainedError'].includes(name)
    || message.includes('could not start video source')
    || message.includes('native camera')
    || message.includes('source not found')
    || message.includes('hardware resources')
    || message.includes('0xc00d3704')
    || message.includes('ressources')
}

export async function startCameraPreview(sourceId: string) {
  if (!sourceId || sourceId === 'off') return null
  return capture.startCameraPreview(sourceId)
}

export async function validateCameraAccess(sourceId: string): Promise<void> {
  if (!sourceId || sourceId === 'off') return
  await startCameraPreview(sourceId)
  await capture.stopCameraPreview()
}
