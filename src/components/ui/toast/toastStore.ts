import { defineStore } from 'pinia';
import { ref } from 'vue';

interface ToastActionBase {
  label: string;
  dismissOnSuccess?: boolean;
  detail?: string;
}

export type ToastAction = ToastActionBase &
  (
    | { onClick: () => void | Promise<void>; copyText?: never }
    | { copyText: string; onClick?: never; copiedLabel?: string; errorLabel?: string }
  );

type ToastCopyAction = ToastActionBase & {
  copyText: string;
  onClick?: never;
  copiedLabel?: string;
  errorLabel?: string;
};

const isCopyAction = (action: ToastAction): action is ToastCopyAction => typeof action.copyText === 'string';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration: number;
  action?: ToastAction;
  leadingIcon?: 'copy' | 'paste';
  count: number;
  revision: number;
}

export interface ToastOptions {
  leadingIcon?: Toast['leadingIcon'];
}

const sameAction = (left?: ToastAction, right?: ToastAction) => {
  if (!left || !right) return left === right;
  if (left.label !== right.label || left.detail !== right.detail || left.dismissOnSuccess !== right.dismissOnSuccess)
    return false;
  if (isCopyAction(left) || isCopyAction(right)) {
    if (!isCopyAction(left) || !isCopyAction(right)) return false;
    return (
      left.copyText === right.copyText && left.copiedLabel === right.copiedLabel && left.errorLabel === right.errorLabel
    );
  }
  return left.onClick === right.onClick;
};

export const useToastStore = defineStore('toast', () => {
  const toasts = ref<Toast[]>([]);
  const removalTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const remove = (id: string) => {
    const timer = removalTimers.get(id);
    if (timer) clearTimeout(timer);
    removalTimers.delete(id);
    toasts.value = toasts.value.filter((toast) => toast.id !== id);
  };

  const scheduleRemoval = (toast: Toast) => {
    const timer = removalTimers.get(toast.id);
    if (timer) clearTimeout(timer);
    if (toast.duration <= 0) return removalTimers.delete(toast.id);
    removalTimers.set(
      toast.id,
      setTimeout(() => remove(toast.id), toast.duration),
    );
  };

  const add = (
    message: string,
    type: Toast['type'] = 'info',
    duration = 3000,
    action?: ToastAction,
    options?: ToastOptions,
  ) => {
    const duplicate = toasts.value.find(
      (toast) =>
        toast.message === message &&
        toast.type === type &&
        toast.duration === duration &&
        toast.leadingIcon === options?.leadingIcon &&
        sameAction(toast.action, action),
    );
    if (duplicate) {
      duplicate.count += 1;
      duplicate.revision += 1;
      scheduleRemoval(duplicate);
      return duplicate.id;
    }

    const id = Math.random().toString(36).substring(2, 9);
    const toast: Toast = {
      id,
      message,
      type,
      duration,
      action,
      leadingIcon: options?.leadingIcon,
      count: 1,
      revision: 0,
    };
    toasts.value.push(toast);
    scheduleRemoval(toast);
    return id;
  };

  const addToast = add;

  const success = (message: string, duration?: number, action?: ToastAction, options?: ToastOptions) =>
    add(message, 'success', duration, action, options);
  const error = (message: string, duration?: number, action?: ToastAction, options?: ToastOptions) =>
    add(message, 'error', duration, action, options);
  const info = (message: string, duration?: number, action?: ToastAction, options?: ToastOptions) =>
    add(message, 'info', duration, action, options);

  return {
    toasts,
    add,
    addToast,
    remove,
    success,
    error,
    info,
  };
});
