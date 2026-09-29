import { createSignal, onCleanup, onMount } from 'solid-js'
import type { BeamApi } from './beamApi'
import type { BeamUiState } from './beamTypes'

/** Observes capture presentation state across the retained native scenes. */
export function useUiState(api: BeamApi) {
  const [state, setState] = createSignal<BeamUiState>({ remaining: 3, shortcut: 'Alt+Shift+R', pauseShortcut: 'Alt+Shift+P', paused: false, busy: false, regionRevision: 0 })
  let disposed = false
  onCleanup(() => { disposed = true })
  onMount(() => {
    void api.uiState().then(value => { if (!disposed) setState(value) }).catch(console.error)
    onCleanup(api.onEvent(event => { if (event.type === 'beamUiState' && event.value) setState(event.value) }))
  })
  return state
}
