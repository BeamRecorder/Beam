import type { TeleprompterShortcutId } from './teleprompter-types'

export const TELEPROMPTER_SHORTCUTS: Array<{ id: TeleprompterShortcutId; defaultKeys: string; category: 'teleprompter' }> = [
  { id: 'teleprompter.toggleVisibility', defaultKeys: 'Alt+Shift+T', category: 'teleprompter' },
  { id: 'teleprompter.toggleAutoscroll', defaultKeys: 'Alt+Shift+O', category: 'teleprompter' },
  { id: 'teleprompter.nextLine', defaultKeys: 'Ctrl+Right', category: 'teleprompter' },
  { id: 'teleprompter.previousLine', defaultKeys: 'Ctrl+Left', category: 'teleprompter' },
]

export const TELEPROMPTER_SHORTCUT_IDS = new Set<string>(TELEPROMPTER_SHORTCUTS.map(({ id }) => id))
