import { ACTION_GROUPS } from './action-catalog';
import type { ActionDefinition, ShortcutSection } from './action-types';

const sections = [
  ['ActionShortcuts.sectionApplication', ['app.settings', 'editor.search']],
  ['ActionShortcuts.sectionHistory', ['editor.undo', 'editor.redo']],
  [
    'ActionShortcuts.sectionSelection',
    [
      'editor.selectAll',
      'editor.deselect',
      'editor.group',
      'editor.ungroup',
      'gesture.addSelection',
      'gesture.rangeSelection',
    ],
  ],
  [
    'ActionShortcuts.sectionClipboard',
    ['editor.copy', 'editor.cut', 'editor.paste', 'editor.duplicate', 'editor.delete'],
  ],
  ['ActionShortcuts.sectionProject', ['action:export', 'action:fullscreen', 'action:recenter']],
  [
    'ActionShortcuts.sectionPlayback',
    [
      'editor.playPause',
      'editor.previousFrame',
      'editor.nextFrame',
      'editor.start',
      'editor.end',
      'teleprompter.toggleVisibility',
      'teleprompter.toggleAutoscroll',
    ],
  ],
  ['ActionShortcuts.sectionNavigation', ['teleprompter.nextLine', 'teleprompter.previousLine']],
  ['SidebarPanel.elements', ['insert:text', 'insert:shape', 'insert:arrow', 'insert:drawing', 'insert:color']],
  ['SidebarPanel.media', ['insert:video', 'insert:image', 'insert:sound', 'insert:voiceover', 'insert:cursor']],
  ['ActionShortcuts.sectionEffects', ['insert:highlight', 'insert:blur', 'insert:zoom']],
  ['ActionShortcuts.sectionCapture', ['action:crop', 'action:copy']],
  ['SidebarPanel.canvas', ['setting:dimensions', 'setting:background-visibility']],
  ['ActionShortcuts.sectionCaptureMode', ['capture.studio', 'capture.screenshot', 'capture.instant']],
  ['ActionShortcuts.sectionCaptureSource', ['capture.screen', 'capture.region', 'capture.window', 'capture.confirm']],
] as const;
const labels = new Map<string, string>(sections.flatMap(([label, ids]) => ids.map((id) => [id, label])));
const propertyLabels: Record<string, string> = {
  ScreenshotComposition: 'SidebarPanel.media',
  CanvasPanel: 'SidebarPanel.canvas',
  ClipPropertiesPanel: 'SidebarPanel.clip',
  TransformControls: 'SidebarPanel.clip',
  Elements: 'SidebarPanel.elements',
  CaptionClipPanel: 'SidebarPanel.captions',
  CaptionPanel: 'SidebarPanel.captions',
  BlurPropertiesPanel: 'ActionShortcuts.sectionEffects',
  Highlight: 'ActionShortcuts.sectionEffects',
  AudioClipPropertiesPanel: 'SidebarPanel.audio',
  AudioPanel: 'SidebarPanel.audio',
  ZoomPanel: 'SidebarPanel.zoom',
  CursorPanel: 'SidebarPanel.cursor',
};

export function actionSectionLabel(action: ActionDefinition): string {
  if (action.id.startsWith('quickSnip.')) return 'ShortcutPreferences.quickSnip';
  if (action.id.startsWith('hud.')) return 'ActionShortcuts.sectionRecorder';
  if (action.group === 'properties') {
    const label = propertyLabels[action.label.split('.')[0]!];
    if (label) return label;
  }
  if (labels.has(action.id)) return labels.get(action.id)!;
  if (action.group === 'gestures') return 'ActionShortcuts.sectionDragging';
  return ACTION_GROUPS.find((group) => group.id === action.group)!.label;
}

export function groupShortcutActions(actions: readonly ActionDefinition[]): ShortcutSection[] {
  const result = new Map<string, ShortcutSection>();
  for (const action of actions) {
    const label = actionSectionLabel(action);
    const id = `${action.group}:${label}`;
    let section = result.get(id);
    if (!section) {
      section = { id, label, group: action.group, actions: [] };
      result.set(id, section);
    }
    section.actions.push(action);
  }
  return [...result.values()];
}
