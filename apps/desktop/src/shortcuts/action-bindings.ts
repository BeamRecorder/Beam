import { shallowRef } from 'vue';
import definitions from '../../shared/action-bindings.json';
import type { ActionBindings, ActionDefinition, ModifierState } from './action-types';
export const PRIMARY_ACTIONS = definitions as ActionDefinition[];
export const actionBindings = shallowRef<ActionBindings>({});
export const hydrateActionBindings = (bindings: ActionBindings) => {
  actionBindings.value = bindings;
};
export const isMacKeyboard = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const aliases: Record<string, string> = {
  control: 'ctrl',
  command: 'meta',
  cmd: 'meta',
  super: 'meta',
  option: 'alt',
  commandorcontrol: 'mod',
  cmdorctrl: 'mod',
  arrowleft: 'left',
  arrowright: 'right',
  arrowup: 'up',
  arrowdown: 'down',
  ' ': 'space',
  esc: 'escape',
  del: 'delete',
  '+': 'plus',
  return: 'enter',
};
const normalizeKey = (key: string) => aliases[key.toLowerCase()] ?? key.toLowerCase();
export function canonicalBinding(keys: string, mac = isMacKeyboard()): string {
  return keys
    .split('+')
    .filter(Boolean)
    .map((key) => {
      const normalized = normalizeKey(key.trim());
      return normalized === 'mod' ? (mac ? 'meta' : 'ctrl') : normalized;
    })
    .sort()
    .join('+');
}
export function actionKeys(id: string, bindings = actionBindings.value): string {
  return bindings[id]?.keys ?? PRIMARY_ACTIONS.find((item) => item.id === id)?.keys ?? '';
}
export function matchesBinding(
  event: ModifierState & { key?: string; code?: string },
  keys: string,
  modifierOnly = false,
  mac = isMacKeyboard(),
): boolean {
  if (!keys) return false;
  const parts = canonicalBinding(keys, mac).split('+');
  const pressed = new Set([
    ...(event.ctrlKey ? ['ctrl'] : []),
    ...(event.metaKey ? ['meta'] : []),
    ...(event.shiftKey ? ['shift'] : []),
    ...(event.altKey ? ['alt'] : []),
  ]);
  for (const modifier of ['ctrl', 'meta', 'shift', 'alt']) {
    if (modifierOnly) {
      if (parts.includes(modifier) && !pressed.has(modifier)) return false;
    } else if (parts.includes(modifier) !== pressed.has(modifier)) return false;
  }
  const key = parts.find((part) => !['ctrl', 'meta', 'shift', 'alt'].includes(part));
  if (modifierOnly) return !key && pressed.size > 0;
  if (!key) return false;
  const actual = normalizeKey(event.key ?? '');
  const physical = normalizeKey((event.code ?? '').replace(/^Key|^Digit/, ''));
  return actual === key || (!/^[a-z0-9]$/i.test(actual) && physical === key);
}
export function matchesAction(event: KeyboardEvent, id: string): boolean {
  const keys = actionKeys(id);
  const definition = PRIMARY_ACTIONS.find((action) => action.id === id);
  return (
    matchesBinding(event, keys) ||
    Boolean(definition && keys === definition.keys && definition.aliases?.some((alias) => matchesBinding(event, alias)))
  );
}
export function matchesGesture(event: ModifierState, id: string): boolean {
  return matchesBinding(event, actionKeys(`gesture.${id}`), true);
}
export function shortcutTargetIsEditable(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [data-shortcut-input]',
      ),
    )
  );
}
export function conflictingActions(
  action: ActionDefinition,
  keys: string,
  actions: readonly ActionDefinition[],
  bindings = actionBindings.value,
): ActionDefinition[] {
  if (!keys) return [];
  const requested = [keys, ...(keys === action.keys ? (action.aliases ?? []) : [])].map((binding) =>
    canonicalBinding(binding),
  );
  return actions.filter(
    (other) =>
      other.id !== action.id &&
      other.kind === action.kind &&
      (action.scope === 'global' ||
        other.scope === 'global' ||
        action.contexts.some((context) => other.contexts.includes(context))) &&
      [
        actionKeys(other.id, bindings),
        ...(actionKeys(other.id, bindings) === other.keys ? (other.aliases ?? []) : []),
      ].some((binding) => binding && requested.includes(canonicalBinding(binding))),
  );
}
