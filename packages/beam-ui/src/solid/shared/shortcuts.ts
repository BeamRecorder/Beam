import type { BeamPreferences } from './beamTypes'

export const shortcutDefaults = {
  'hud.startStopRecording': 'Alt+Shift+R',
  'hud.playPause': 'Alt+Shift+P',
  'teleprompter.toggleVisibility': 'Alt+Shift+T',
  'teleprompter.toggleAutoscroll': 'Alt+Shift+O',
  'teleprompter.nextLine': 'Ctrl+Shift+Right',
  'teleprompter.previousLine': 'Ctrl+Shift+Left',
} as const

/** Reads the same saved accelerators used by the native launcher and reader. */
export function activeShortcuts(value: BeamPreferences): Record<string, string> {
  return Object.fromEntries(Object.entries(shortcutDefaults).map(([id, fallback]) => [id, value.shortcuts[id] ?? fallback]))
}
