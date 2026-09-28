import { createSignal, onCleanup, onMount } from 'solid-js'
import type { BeamApi } from '../shared/beamApi'
import { createDefaultTeleprompterDocument, type TeleprompterDocument } from './teleprompterTypes'
import { utf8ByteLength } from './textEncoding'

/** Loads and serially saves the typed script through the native document store. */
export function useTeleprompter(api: BeamApi) {
  const [document, setDocument] = createSignal(createDefaultTeleprompterDocument())
  const [ready, setReady] = createSignal(false)
  const [error, setError] = createSignal('')
  let timer: ReturnType<typeof setTimeout> | undefined
  let saving: Promise<void> | undefined
  let version = 0, savedVersion = 0, attemptedVersion = -1
  let disposed = false
  onMount(() => {
    void api.readTeleprompter().then(value => {
      if (!disposed) { setDocument(value); setReady(true) }
    }).catch(cause => setError(String(cause)))
    onCleanup(api.onEvent(event => { if (event.type === 'windowVisibility' && !event.visible) void flush() }))
  })
  onCleanup(() => { disposed = true; if (timer) clearTimeout(timer) })
  async function flush(): Promise<void> {
    if (!ready() || version === savedVersion) return
    if (saving) { await saving; if (version !== attemptedVersion) await flush(); return }
    const revision = version
    attemptedVersion = revision
    const value = document()
    saving = api.writeTeleprompter(value).then(() => { savedVersion = revision }).catch(cause => { setError(String(cause)) })
      .finally(() => { saving = undefined })
    await saving
  }
  function update(patch: Partial<TeleprompterDocument>): void {
    if (!ready()) return
    if (patch.text !== undefined && utf8ByteLength(patch.text) > 48 * 1024) {
      setError('Script limit: 48 KiB'); return
    }
    setError('')
    setDocument(value => ({ ...value, ...patch, updatedAtUtc: new Date().toISOString() }))
    version++
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void flush(), 350)
  }
  return { document, ready, error, update, flush }
}
