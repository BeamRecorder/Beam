import { createSignal, onCleanup, onMount } from 'solid-js'
import type { BeamApi } from '../shared/beamApi'
import { createDefaultTeleprompterDocument, type TeleprompterDocument } from './teleprompterTypes'
import { validateDocument } from './documentValidation'

/** Loads and serially saves the typed script through the native document store. */
export function useTeleprompter(api: BeamApi) {
  const [document, setDocument] = createSignal(createDefaultTeleprompterDocument())
  const [ready, setReady] = createSignal(false)
  const [error, setError] = createSignal('')
  let timer: ReturnType<typeof setTimeout> | undefined
  let saving: Promise<void> | undefined
  let version = 0, savedVersion = 0
  let disposed = false

  const reportError = (cause: unknown) => { if (!disposed) setError(String(cause)) }
  const clearTimer = () => { clearTimeout(timer); timer = undefined }

  onMount(() => {
    void api.readTeleprompter().then(value => {
      if (disposed) return
      validateDocument(value)
      setDocument(value)
      setReady(true)
    }).catch(reportError)
    onCleanup(api.onEvent(event => {
      if (event.type === 'windowVisibility' && !event.visible && (!event.window || event.window === 'teleprompter')) {
        void flush().catch(reportError)
      }
    }))
  })
  onCleanup(() => {
    disposed = true
    clearTimer()
    void flush().catch(console.error)
  })

  async function saveLatest(): Promise<void> {
    while (version !== savedVersion) {
      const revision = version
      const value = { ...document() }
      await api.writeTeleprompter(value)
      savedVersion = revision
    }
    clearTimer()
  }

  /** Resolves only after all edits, including edits made during a write, are saved. */
  async function flush(): Promise<void> {
    clearTimer()
    while (ready() && version !== savedVersion) {
      saving ??= saveLatest().catch(cause => {
        reportError(cause)
        throw cause
      }).finally(() => { saving = undefined })
      await saving
    }
  }

  function update(patch: Partial<TeleprompterDocument>): void {
    if (!ready() || disposed) return
    const current = document()
    if ((Object.keys(patch) as (keyof TeleprompterDocument)[]).every(key => patch[key] === current[key])) return
    const next = { ...current, ...patch, updatedAtUtc: new Date().toISOString() }
    try { validateDocument(next, next.text !== current.text) } catch (cause) { reportError(cause); return }
    setError('')
    version++
    setDocument(next)
    clearTimer()
    timer = setTimeout(() => { timer = undefined; void flush().catch(reportError) }, 350)
  }
  return { document, ready, error, update, flush }
}
