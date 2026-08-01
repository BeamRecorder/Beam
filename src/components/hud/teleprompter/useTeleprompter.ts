import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { capture } from '~/api/capture'
import type { TeleprompterDocument, TeleprompterSessionContext } from './teleprompter-types'
import { clampTeleprompterLine, createDefaultTeleprompterDocument, splitTeleprompterLines } from './teleprompter-types'

const saveDelay = 350

export function useTeleprompter() {
  const document = ref<TeleprompterDocument>(createDefaultTeleprompterDocument())
  const session = ref<TeleprompterSessionContext | null>(null)
  const activeLine = ref(0)
  const isEditing = ref(true)
  const isPaused = ref(false)
  const error = ref('')
  const displayRef = ref<HTMLElement | null>(null)
  const lines = computed(() => splitTeleprompterLines(document.value.text))
  let frame: number | null = null
  let lastFrameAt = 0
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let lineTimer: ReturnType<typeof setTimeout> | null = null

  const cancelFrame = () => { if (frame !== null) window.cancelAnimationFrame(frame); frame = null; lastFrameAt = 0 }
  const cancelLineTimer = () => { if (lineTimer !== null) window.clearTimeout(lineTimer); lineTimer = null }

  const save = async () => {
    if (!session.value) return
    const next = { ...document.value, updatedAtUtc: new Date().toISOString() }
    document.value = next
    try {
      await capture.saveSessionTeleprompter(session.value.projectId, session.value.sessionId, next)
      error.value = ''
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason)
    }
  }

  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => { saveTimer = null; void save() }, saveDelay)
  }

  const updateDocument = (patch: Partial<Omit<TeleprompterDocument, 'schemaVersion' | 'updatedAtUtc'>>) => {
    document.value = { ...document.value, ...patch, updatedAtUtc: new Date().toISOString() }
    scheduleSave()
  }

  const scrollActiveLine = () => {
    const display = displayRef.value
    const element = display?.querySelector<HTMLElement>(`[data-line-index="${activeLine.value}"]`)
    if (!display || !element) return
    const targetTop = Math.max(0, element.offsetTop - display.clientHeight * 0.38)
    display.scrollTo({ top: targetTop, behavior: 'smooth' })
  }

  const setActiveLine = (index: number) => {
    activeLine.value = clampTeleprompterLine(index, lines.value.length)
    if (document.value.mode === 'line-by-line') scrollActiveLine()
  }
  const nextLine = () => setActiveLine(activeLine.value + 1)
  const previousLine = () => setActiveLine(activeLine.value - 1)

  const scheduleLineAdvance = () => {
    cancelLineTimer()
    if (!document.value.autoscroll || isPaused.value || document.value.mode !== 'line-by-line' || activeLine.value >= lines.value.length - 1) return
    const duration = Math.max(800, 2600 - document.value.scrollSpeed * 15)
    lineTimer = setTimeout(() => { nextLine(); scheduleLineAdvance() }, duration)
  }

  const tick = (now: number) => {
    frame = null
    if (!document.value.autoscroll || isPaused.value || document.value.mode !== 'continuous') return
    const element = displayRef.value
    if (!element) { frame = window.requestAnimationFrame(tick); return }
    const elapsed = lastFrameAt ? Math.min(100, now - lastFrameAt) : 0
    lastFrameAt = now
    const maxScroll = Math.max(0, element.scrollHeight - element.clientHeight)
    element.scrollTop = Math.min(maxScroll, element.scrollTop + (document.value.scrollSpeed * elapsed) / 1000)
    if (element.scrollTop < maxScroll) frame = window.requestAnimationFrame(tick)
  }

  const startAutoscroll = () => {
    cancelFrame(); cancelLineTimer()
    if (!document.value.autoscroll || isPaused.value) return
    if (document.value.mode === 'continuous') frame = window.requestAnimationFrame(tick)
    else scheduleLineAdvance()
  }

  const toggleAutoscroll = () => updateDocument({ autoscroll: !document.value.autoscroll })
  const togglePause = () => {
    if (isPaused.value || !document.value.autoscroll) {
      isPaused.value = false
      if (!document.value.autoscroll) updateDocument({ autoscroll: true })
      startAutoscroll()
      return
    }
    isPaused.value = true
    cancelFrame()
    cancelLineTimer()
  }

  const applySession = async (context: TeleprompterSessionContext | null) => {
    session.value = context
    error.value = ''
    activeLine.value = 0
    cancelFrame(); cancelLineTimer()
    if (!context) return
    let stored: TeleprompterDocument | null = null
    try {
      stored = await capture.getSessionTeleprompter(context.projectId, context.sessionId)
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason)
      return
    }
    if (stored) document.value = stored
    else await save()
    startAutoscroll()
  }

  const handleShortcut = (id: string) => {
    if (id === 'teleprompter.toggleAutoscroll') toggleAutoscroll()
    else if (id === 'teleprompter.nextLine') nextLine()
    else if (id === 'teleprompter.previousLine') previousLine()
  }

  const setDisplayElement = (element: HTMLElement | null) => { displayRef.value = element; if (element) startAutoscroll() }
  watch(() => document.value.mode, () => { activeLine.value = 0; startAutoscroll() })
  watch(() => lines.value.length, () => { activeLine.value = clampTeleprompterLine(activeLine.value, lines.value.length); startAutoscroll() })
  watch(() => document.value.autoscroll, startAutoscroll)
  watch(() => document.value.scrollSpeed, startAutoscroll)
  onBeforeUnmount(() => { cancelFrame(); cancelLineTimer(); if (saveTimer) clearTimeout(saveTimer); void save() })

  return { document, session, lines, activeLine, isEditing, isPaused, error, displayRef, setDisplayElement, updateDocument, applySession, handleShortcut, nextLine, previousLine, toggleAutoscroll, togglePause, save }
}
