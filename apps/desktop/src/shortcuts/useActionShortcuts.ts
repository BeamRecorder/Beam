import type { ShortcutAction } from './action-types';
import { onMounted, onScopeDispose } from 'vue';
import {
  matchesAction,
  matchesBinding,
  actionKeys,
  canonicalBinding,
  shortcutTargetIsEditable,
} from './action-bindings';
export function useActionShortcuts(
  actions: () => readonly ShortcutAction[],
  disabled: () => boolean = () => false,
  onError: (error: unknown) => void = console.error,
) {
  const keydown = (event: KeyboardEvent) => {
    if (
      event.defaultPrevented ||
      event.repeat ||
      event.isComposing ||
      disabled() ||
      shortcutTargetIsEditable(event.target) ||
      shortcutTargetIsEditable(document.activeElement) ||
      document.querySelector('[role="dialog"][aria-modal="true"], [role="menu"]')
    )
      return;
    const action = actions().find((action) => !action.disabled && matchesAction(event, action.id));
    if (!action) {
      if (
        matchesBinding(event, 'CommandOrControl+V') &&
        canonicalBinding(actionKeys('editor.paste')) !== canonicalBinding('CommandOrControl+V')
      )
        event.preventDefault();
      return;
    }
    event.preventDefault();
    try {
      Promise.resolve(action.run()).catch(onError);
    } catch (error) {
      onError(error);
    }
  };
  onMounted(() => window.addEventListener('keydown', keydown));
  onScopeDispose(() => window.removeEventListener('keydown', keydown));
  return { keydown };
}
