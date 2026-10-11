import { describe, expect, it } from 'vitest';
import { configurableActions } from './action-catalog';
import { actionSectionLabel, groupShortcutActions } from './action-sections';
import type { ActionDefinition } from './action-types';

const actions = configurableActions();
const action = (id: string) => {
  const found = actions.find((entry) => entry.id === id);
  if (!found) throw new Error(`Missing action ${id}`);
  return found;
};
describe('shortcut subcategories', () => {
  it.each([
    ['quickSnip.recordScreen', 'ShortcutPreferences.quickSnip'],
    ['quickSnip.recordRegion', 'ShortcutPreferences.quickSnip'],
    ['quickSnip.recordWindow', 'ShortcutPreferences.quickSnip'],
    ['hud.playPause', 'ActionShortcuts.sectionRecorder'],
    ['editor.undo', 'ActionShortcuts.sectionHistory'],
    ['editor.paste', 'ActionShortcuts.sectionClipboard'],
    ['gesture.constrain', 'ActionShortcuts.sectionDragging'],
    ['gesture.rangeSelection', 'ActionShortcuts.sectionSelection'],
    ['editor.split', 'ActionShortcuts.timeline'],
    ['navigate:canvas', 'ActionShortcuts.view'],
    ['setting:CaptionClipPanel.fontSize', 'SidebarPanel.captions'],
    ['setting:TransformControls.width', 'SidebarPanel.clip'],
  ])('places %s under %s', (id, label) => {
    expect(actionSectionLabel(action(id))).toBe(label);
  });
  it('retains the Properties category for an uncatalogued property namespace', () => {
    expect(
      actionSectionLabel({
        ...action('editor.copy'),
        id: 'setting:Other.value',
        group: 'properties',
        label: 'Other.value',
      }),
    ).toBe('ActionShortcuts.properties');
  });
  it('keeps every configurable action exactly once without mixing main categories', () => {
    const grouped = groupShortcutActions(actions);
    expect(grouped.flatMap((section) => section.actions)).toHaveLength(actions.length);
    expect(new Set(grouped.flatMap((section) => section.actions.map((entry) => entry.id))).size).toBe(actions.length);
    for (const section of grouped) expect(section.actions.every((entry) => entry.group === section.group)).toBe(true);
    expect(grouped.every((section) => section.actions.length > 0)).toBe(true);
  });
  it('does not merge the same subcategory across main categories', () => {
    const grouped = groupShortcutActions([action('editor.selectAll'), action('gesture.addSelection')]);
    expect(grouped).toHaveLength(2);
    expect(grouped[0]!.label).toBe(grouped[1]!.label);
    expect(grouped[0]!.id).not.toBe(grouped[1]!.id);
  });
  it('preserves the order of sections and their rows without mutating the catalogue', () => {
    const source: ActionDefinition[] = [action('editor.redo'), action('editor.copy'), action('editor.undo')];
    const original = [...source];
    const grouped = groupShortcutActions(source);
    expect(grouped.map((section) => section.actions.map((entry) => entry.id))).toEqual([
      ['editor.redo', 'editor.undo'],
      ['editor.copy'],
    ]);
    expect(source).toEqual(original);
  });
  it('returns no empty sections for an empty search', () => expect(groupShortcutActions([])).toEqual([]));
});
