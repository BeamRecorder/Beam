import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info' | 'warning'
  duration?: number
  action?: ToastAction
}

export const useToastStore = defineStore('toast', () => {
  const toasts = ref<Toast[]>([])

  const add = (message: string, type: Toast['type'] = 'info', duration = 3000, action?: ToastAction) => {
    const id = Math.random().toString(36).substring(2, 9)
    const toast: Toast = { id, message, type, duration, action }
    toasts.value.push(toast)

    if (duration > 0) {
      setTimeout(() => {
        remove(id)
      }, duration)
    }
  }

  const addToast = add

  const remove = (id: string) => {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }

  const success = (message: string, duration?: number, action?: ToastAction) => add(message, 'success', duration, action)
  const error = (message: string, duration?: number, action?: ToastAction) => add(message, 'error', duration, action)
  const info = (message: string, duration?: number, action?: ToastAction) => add(message, 'info', duration, action)

  return {
    toasts,
    add,
    addToast,
    remove,
    success,
    error,
    info,
  }
})
