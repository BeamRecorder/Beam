import { describe, expect, it, vi, afterEach } from 'vitest';
import { shortcutKeyLabel, shortcutLabel } from './shortcut-label';
afterEach(() => vi.unstubAllGlobals());
describe('shortcut labels', () => {
  it.each([
    ['CommandOrControl', 'Ctrl', '⌘'],
    ['CmdOrCtrl', 'Ctrl', '⌘'],
    ['control', 'Ctrl', '⌃'],
    ['ctrl', 'Ctrl', '⌃'],
    ['option', 'Alt', '⌥'],
    ['alt', 'Alt', '⌥'],
    ['shift', 'Shift', '⇧'],
    ['meta', '⌘', '⌘'],
    ['cmd', '⌘', '⌘'],
    ['command', '⌘', '⌘'],
    ['super', '⌘', '⌘'],
    ['enter', '↵', '↵'],
    ['return', '↵', '↵'],
    ['escape', 'Esc', 'Esc'],
    ['esc', 'Esc', 'Esc'],
    ['backspace', '⌫', '⌫'],
    ['left', '←', '←'],
    ['space', 'Space', 'Space'],
    ['f', 'F', 'F'],
    [' home ', 'Home', 'Home'],
    ['', '', ''],
  ])('formats %s', (key, other, mac) => {
    expect(shortcutKeyLabel(key, false)).toBe(other);
    expect(shortcutKeyLabel(key, true)).toBe(mac);
  });
  it('joins each platform’s modifiers and keeps empty bindings empty', () => {
    expect(shortcutLabel('CommandOrControl+Shift+F', false)).toBe('Ctrl+Shift+F');
    expect(shortcutLabel('CommandOrControl+Shift+F', true)).toBe('⌘⇧F');
    expect(shortcutLabel('', true)).toBe('');
  });
  it('uses the current keyboard platform by default', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' });
    expect(shortcutLabel('CommandOrControl+F')).toBe('⌘F');
    expect(shortcutKeyLabel('Alt')).toBe('⌥');
  });
});
