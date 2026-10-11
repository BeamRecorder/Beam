import { PRIMARY_ACTIONS } from './action-bindings';
import { EDITOR_PROPERTY_GROUPS } from '~/components/editor/search/editor-property-catalog';
import type { ActionDefinition, ActionContext } from './action-types';
export function configurableActions(): ActionDefinition[] {
  const actions = new Map(PRIMARY_ACTIONS.map((action) => [action.id, action]));
  for (const group of EDITOR_PROPERTY_GROUPS) {
    if (group.tab === 'settings') continue;
    const contexts: ActionContext[] = group.videoOnly ? ['video'] : [...(group.modes ?? ['video', 'screenshot'])];
    for (const key of group.keys) {
      const id = `setting:${group.namespace}.${key}`;
      const existing = actions.get(id);
      actions.set(id, {
        id,
        keys: '',
        group: 'properties',
        label: `${group.namespace}.${key}`,
        contexts: [...new Set([...(existing?.contexts ?? []), ...contexts])],
        scope: 'application',
        kind: 'keyboard',
      });
    }
  }
  return [...actions.values()];
}
export const ACTION_GROUPS = [
  { id: 'editing', label: 'ActionShortcuts.editing' },
  { id: 'tools', label: 'ActionShortcuts.tools' },
  { id: 'timeline', label: 'ActionShortcuts.timeline' },
  { id: 'view', label: 'ActionShortcuts.view' },
  { id: 'gestures', label: 'ActionShortcuts.gestures' },
  { id: 'recording', label: 'ShortcutPreferences.recordingCategory' },
  { id: 'teleprompter', label: 'ShortcutPreferences.teleprompterCategory' },
  { id: 'properties', label: 'ActionShortcuts.properties' },
] as const;
