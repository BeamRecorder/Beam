import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { ProjectComposition } from '../composition/composition-types'
import type { ZoomElement } from '../zoom/zoom-types'
import type { OutputCanvasSettings } from '../canvas/output-canvas'
import type { BackgroundValue } from './backgroundCatalog'

export interface EditorStateSnapshot {
  composition: ProjectComposition
  zoomElements: ZoomElement[]
  outputCanvas: OutputCanvasSettings
  selectedBackground: BackgroundValue | null
  backgroundBlurPercent: number
}

const MAX_HISTORY_DEPTH = 50

export function useEditorUndoRedo(options: {
  onRestoreSnapshot: (snapshot: EditorStateSnapshot) => void
}) {
  const undoStack = ref<EditorStateSnapshot[]>([])
  const redoStack = ref<EditorStateSnapshot[]>([])
  let isRestoring = false
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  const canUndo = computed(() => undoStack.value.length > 1)
  const canRedo = computed(() => redoStack.value.length > 0)

  const cloneSnapshot = (snapshot: EditorStateSnapshot): EditorStateSnapshot => {
    return JSON.parse(JSON.stringify(snapshot))
  }

  const recordSnapshot = (snapshot: EditorStateSnapshot, debounceMs = 0) => {
    if (isRestoring) return

    const executeRecord = () => {
      const cloned = cloneSnapshot(snapshot)
      const currentTop = undoStack.value.at(-1)

      if (currentTop && JSON.stringify(currentTop) === JSON.stringify(cloned)) {
        return
      }

      undoStack.value.push(cloned)
      if (undoStack.value.length > MAX_HISTORY_DEPTH) {
        undoStack.value.shift()
      }
      redoStack.value = []
    }

    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }

    if (debounceMs > 0) {
      debounceTimer = setTimeout(() => {
        executeRecord()
        debounceTimer = null
      }, debounceMs)
    } else {
      executeRecord()
    }
  }

  const undo = () => {
    if (!canUndo.value) return
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }

    isRestoring = true
    const current = undoStack.value.pop()
    if (current) {
      redoStack.value.push(current)
    }

    const previous = undoStack.value.at(-1)
    if (previous) {
      options.onRestoreSnapshot(cloneSnapshot(previous))
    }
    isRestoring = false
  }

  const redo = () => {
    if (!canRedo.value) return
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }

    isRestoring = true
    const next = redoStack.value.pop()
    if (next) {
      const cloned = cloneSnapshot(next)
      undoStack.value.push(cloned)
      options.onRestoreSnapshot(cloned)
    }
    isRestoring = false
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    const active = document.activeElement
    if (active) {
      const tagName = active.tagName.toLowerCase()
      const isEditable = active.getAttribute('contenteditable') === 'true'
      if (tagName === 'input' || tagName === 'textarea' || tagName === 'select' || isEditable) {
        return // allow native input undo/redo inside text boxes
      }
    }

    const isCtrlOrCmd = e.ctrlKey || e.metaKey
    if (!isCtrlOrCmd) return

    if (e.key === 'z' || e.key === 'Z') {
      e.preventDefault()
      if (e.shiftKey) {
        redo()
      } else {
        undo()
      }
    } else if (e.key === 'y' || e.key === 'Y') {
      e.preventDefault()
      redo()
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeyDown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown)
    if (debounceTimer) clearTimeout(debounceTimer)
  })

  return {
    undoStack,
    redoStack,
    canUndo,
    canRedo,
    recordSnapshot,
    undo,
    redo,
  }
}
