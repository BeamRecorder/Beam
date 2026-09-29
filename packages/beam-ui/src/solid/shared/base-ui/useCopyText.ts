import { createEffect, createSignal, onCleanup, type Accessor } from 'solid-js'
import type { CopyTextState } from './copyButtonTypes'

/** Native clipboard feedback belongs to the exact text copied, including late replies. */
export function useCopyText(value: Accessor<string>, write: (text: string) => Promise<void>): CopyTextState {
  const [pending, setPending] = createSignal(false)
  const [copied, setCopied] = createSignal(false)
  const [error, setError] = createSignal('')
  let revision = 0, disposed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const reset = () => { clearTimeout(timer); timer = undefined; setCopied(false); setError('') }
  createEffect(() => { value(); revision++; reset() })
  onCleanup(() => { disposed = true; revision++; clearTimeout(timer) })

  async function copy(): Promise<void> {
    const text = value(), requested = revision
    if (disposed || pending() || !text) return
    reset(); setPending(true)
    try {
      await write(text)
      if (disposed || requested !== revision) return
      setCopied(true)
      timer = setTimeout(() => { timer = undefined; setCopied(false) }, 1600)
    } catch (cause) {
      if (!disposed && requested === revision) setError(String(cause))
    } finally {
      if (!disposed) setPending(false)
    }
  }
  return { pending, copied, error, copy }
}
