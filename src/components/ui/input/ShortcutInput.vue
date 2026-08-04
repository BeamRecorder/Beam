<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import KeyboardChip from '../Kbd/KeyboardChip.vue'
import { X, RotateCcw } from '@lucide/vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    disabled?: boolean
    error?: boolean | string
  }>(),
  {
    placeholder: 'Press shortcut...',
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'change', value: string): void
  (e: 'reset'): void
}>()

const isRecording = ref(false)
const capturedKeys = ref<string[]>([])
const inputRef = ref<HTMLDivElement | null>(null)

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)

const normalizeEventKey = (e: KeyboardEvent): string | null => {
  const code = e.code

  // Modifiers
  if (['ControlLeft', 'ControlRight'].includes(code)) return isMac ? 'Control' : 'Ctrl'
  if (['ShiftLeft', 'ShiftRight'].includes(code)) return 'Shift'
  if (['AltLeft', 'AltRight'].includes(code)) return 'Alt'
  if (['MetaLeft', 'MetaRight'].includes(code)) return isMac ? 'Command' : 'Super'

  // Special keys
  if (code === 'Space') return 'Space'
  if (code === 'Enter' || code === 'NumpadEnter') return 'Enter'
  if (code === 'Backspace') return 'Backspace'
  if (code === 'Tab') return null // allow tabbing away if not recording

  // Key codes like KeyA -> A, Digit1 -> 1, F1 -> F1
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Numpad') && code.length === 7) return code.slice(6)
  if (/^F\d+$/.test(code)) return code

  // Arrow keys
  if (code === 'ArrowUp') return 'Up'
  if (code === 'ArrowDown') return 'Down'
  if (code === 'ArrowLeft') return 'Left'
  if (code === 'ArrowRight') return 'Right'

  // Fallback to e.key uppercase if single char
  if (e.key && e.key.length === 1) {
    return e.key.toUpperCase()
  }

  return e.key || null
}

const formatAccelerator = (modifiers: string[], key: string | null): string => {
  const result: string[] = []
  if (modifiers.includes('Control') || modifiers.includes('Ctrl')) {
    result.push(isMac ? 'Control' : 'Ctrl')
  }
  if (modifiers.includes('Alt')) result.push('Alt')
  if (modifiers.includes('Shift')) result.push('Shift')
  if (modifiers.includes('Command') || modifiers.includes('Super')) {
    result.push(isMac ? 'Command' : 'Super')
  }
  if (key && !modifiers.includes(key)) {
    result.push(key)
  }
  return result.join('+')
}

const handleKeyDown = (e: KeyboardEvent) => {
  if (!isRecording.value || props.disabled) return

  e.preventDefault()
  e.stopPropagation()

  if (e.key === 'Escape') {
    stopRecording()
    return
  }

  const modifiers: string[] = []
  if (e.ctrlKey) modifiers.push(isMac ? 'Control' : 'Ctrl')
  if (e.altKey) modifiers.push('Alt')
  if (e.shiftKey) modifiers.push('Shift')
  if (e.metaKey) modifiers.push(isMac ? 'Command' : 'Super')

  const key = normalizeEventKey(e)
  const isModifierOnly = key && ['Ctrl', 'Control', 'Alt', 'Shift', 'Command', 'Super'].includes(key)

  if (isModifierOnly) {
    capturedKeys.value = [...new Set(modifiers)]
    return
  }

  const mainKey = isModifierOnly ? null : key
  const accelerator = formatAccelerator(modifiers, mainKey)

  if (accelerator !== undefined) {
    emit('update:modelValue', accelerator)
    emit('change', accelerator)
    stopRecording()
  }
}

const startRecording = () => {
  if (props.disabled) return
  isRecording.value = true
  capturedKeys.value = []
}

const stopRecording = () => {
  isRecording.value = false
  capturedKeys.value = []
}

const handleClickOutside = (e: MouseEvent) => {
  if (inputRef.value && !inputRef.value.contains(e.target as Node)) {
    stopRecording()
  }
}

const handleClear = (e: MouseEvent) => {
  e.stopPropagation()
  emit('update:modelValue', '')
  emit('change', '')
  stopRecording()
}

const handleReset = (e: MouseEvent) => {
  e.stopPropagation()
  emit('reset')
  stopRecording()
}

onMounted(() => {
  window.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
  window.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div class="shortcut-input-container">
    <div
      ref="inputRef"
      class="shortcut-input"
      :class="{
        'is-recording': isRecording,
        'is-disabled': disabled,
        'is-error': !!error,
      }"
      tabindex="0"
      @click="startRecording"
      @keydown="handleKeyDown"
    >
      <div v-if="isRecording" class="recording-state">
        <span class="recording-dot" />
        <span v-if="capturedKeys.length === 0" class="recording-prompt">Press key combination...</span>
        <KeyboardChip v-else :keys="capturedKeys" size="sm" />
      </div>

      <div v-else-if="modelValue" class="value-state">
        <KeyboardChip :shortcut="modelValue" size="sm" />
      </div>

      <div v-else class="placeholder-state">
        {{ placeholder }}
      </div>

      <div class="action-buttons">
        <button
          v-if="modelValue && !disabled"
          type="button"
          class="icon-button"
          title="Clear shortcut"
          @click="handleClear"
        >
          <X class="btn-icon" />
        </button>
        <button v-if="!disabled" type="button" class="icon-button" title="Reset to default" @click="handleReset">
          <RotateCcw class="btn-icon" />
        </button>
      </div>
    </div>
    <span v-if="typeof error === 'string' && error" class="shortcut-error-msg">
      {{ error }}
    </span>
  </div>
</template>

<style scoped>
.shortcut-input-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
}

.shortcut-input {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 2rem;
  padding: 0 8px;
  background-color: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  outline: none;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
  user-select: none;
}

.shortcut-input:hover:not(.is-disabled) {
  border-color: var(--color-border-strong);
}

.shortcut-input.is-recording {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-light);
  background-color: var(--color-bg-element);
}

.shortcut-input.is-disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.shortcut-input.is-error {
  border-color: var(--color-error);
}

.recording-state {
  display: flex;
  align-items: center;
  gap: 6px;
}

.recording-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--color-primary);
  animation: pulse 1s infinite alternate;
}

@keyframes pulse {
  from {
    opacity: 0.4;
  }
  to {
    opacity: 1;
  }
}

.recording-prompt {
  font-size: 11px;
  color: var(--text-muted);
}

.placeholder-state {
  font-size: 11px;
  color: var(--text-muted);
}

.value-state {
  display: flex;
  align-items: center;
  pointer-events: none;
}

.action-buttons {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text-muted);
  padding: 2px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition:
    color 0.15s ease,
    background-color 0.15s ease;
}

.icon-button:hover {
  color: var(--text-primary);
  background-color: var(--color-bg-element);
}

.btn-icon {
  width: 12px;
  height: 12px;
}

.shortcut-error-msg {
  font-size: 11px;
  color: var(--color-error);
  font-weight: 500;
}
</style>
