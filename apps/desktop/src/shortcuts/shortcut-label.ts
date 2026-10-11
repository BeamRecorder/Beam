import { isMacKeyboard } from './action-bindings';

export function shortcutKeyLabel(key: string, mac = isMacKeyboard()): string {
  const trimmed = key.trim();
  const name = trimmed.toLowerCase();
  if (['commandorcontrol', 'cmdorctrl'].includes(name)) return mac ? '⌘' : 'Ctrl';
  if (['command', 'cmd', 'meta', 'super'].includes(name)) return '⌘';
  if (['control', 'ctrl'].includes(name)) return mac ? '⌃' : 'Ctrl';
  if (['alt', 'option'].includes(name)) return mac ? '⌥' : 'Alt';
  if (name === 'shift') return mac ? '⇧' : 'Shift';
  const labels: Record<string, string> = {
    space: 'Space',
    enter: '↵',
    return: '↵',
    backspace: '⌫',
    escape: 'Esc',
    esc: 'Esc',
    left: '←',
    arrowleft: '←',
    right: '→',
    arrowright: '→',
    up: '↑',
    arrowup: '↑',
    down: '↓',
    arrowdown: '↓',
    plus: '+',
  };
  return labels[name] ?? trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function shortcutLabel(keys: string, mac = isMacKeyboard()): string {
  return keys
    .split('+')
    .filter(Boolean)
    .map((key) => shortcutKeyLabel(key, mac))
    .join(mac ? '' : '+');
}
