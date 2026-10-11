import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  actionKeys,
  canonicalBinding,
  conflictingActions,
  hydrateActionBindings,
  matchesAction,
  matchesBinding,
  matchesGesture,
  PRIMARY_ACTIONS,
  shortcutTargetIsEditable,
} from './action-bindings';
import { configurableActions } from './action-catalog';
import type { ActionBindings } from './action-types';
import { additiveSelection, constrainPointerDelta, pointerSelectionIsAdditive } from './pointer-modifiers';
const key = (key: string, init: KeyboardEventInit = {}) => new KeyboardEvent('keydown', { key, ...init });
afterEach(() => {
  hydrateActionBindings({});
  vi.restoreAllMocks();
});
describe('shared action bindings', () => {
  it.each([
    ['CommandOrControl+Shift+A', 'a', { ctrlKey: true, shiftKey: true }, false],
    ['CommandOrControl+Shift+A', 'a', { metaKey: true, shiftKey: true }, true],
    ['Control+K', 'k', { ctrlKey: true }, true],
    ['Super+K', 'k', { metaKey: true }, false],
    ['Alt+Up', 'ArrowUp', { altKey: true }, false],
    ['Space', ' ', {}, false],
    ['Ctrl+Plus', '+', { ctrlKey: true }, false],
  ])('matches %s on the correct platform', (binding, value, init, mac) => {
    expect(matchesBinding(key(value, init), binding, false, mac)).toBe(true);
    expect(
      matchesBinding(key(value, { ...init, altKey: !('altKey' in init && init.altKey) }), binding, false, mac),
    ).toBe(false);
  });
  it('does not match modifier-only bindings as keyboard actions, empty bindings or another key', () => {
    for (const binding of ['', 'Control', 'Ctrl+A']) expect(matchesBinding(key('k'), binding)).toBe(false);
    expect(matchesBinding(key('Shift', { shiftKey: true }), 'Shift', true)).toBe(true);
    expect(matchesBinding(key('k', { ctrlKey: true }), 'Ctrl+K', true)).toBe(false);
    expect(matchesBinding(key('Shift'), 'Shift', true)).toBe(false);
  });
  it('preserves keyboard layout letters while accepting physical codes for non-Latin / Alt input', () => {
    expect(matchesBinding(key('a', { code: 'KeyQ', ctrlKey: true }), 'Ctrl+A')).toBe(true);
    expect(matchesBinding(key('a', { code: 'KeyQ', ctrlKey: true }), 'Ctrl+Q')).toBe(false);
    expect(matchesBinding(key('œ', { code: 'KeyQ', altKey: true }), 'Alt+Q')).toBe(true);
    expect(canonicalBinding('Shift+Control+a', false)).toBe(canonicalBinding('Ctrl+Shift+A', false));
    expect(canonicalBinding('CommandOrControl+A', true)).toBe('a+meta');
  });
  it('updates immediately, removes old defaults and honors explicit disabled shortcuts', () => {
    expect(matchesAction(key('a', { ctrlKey: true }), 'editor.selectAll')).toBe(true);
    hydrateActionBindings({ 'editor.selectAll': { keys: 'Ctrl+K', scope: 'application', category: 'editing' } });
    expect(matchesAction(key('a', { ctrlKey: true }), 'editor.selectAll')).toBe(false);
    expect(matchesAction(key('k', { ctrlKey: true }), 'editor.selectAll')).toBe(true);
    hydrateActionBindings({ 'editor.selectAll': { keys: '', scope: 'application', category: 'editing' } });
    expect(actionKeys('editor.selectAll')).toBe('');
    expect(actionKeys('missing')).toBe('');
    expect(matchesAction(key('a', { ctrlKey: true }), 'editor.selectAll')).toBe(false);
  });
  it('keeps familiar alternate defaults only until the action is customized', () => {
    expect(matchesAction(key('Backspace'), 'editor.delete')).toBe(true);
    expect(matchesAction(key('y', { ctrlKey: true }), 'editor.redo')).toBe(true);
    hydrateActionBindings({ 'editor.delete': { keys: 'Ctrl+Delete', scope: 'application', category: 'editing' } });
    expect(matchesAction(key('Backspace'), 'editor.delete')).toBe(false);
    expect(matchesAction(key('Delete', { ctrlKey: true }), 'editor.delete')).toBe(true);
  });
  it('allows modifier combinations, constraint and additive selection to follow their saved keys', () => {
    expect(constrainPointerDelta({ x: 20, y: 3 }, key('Shift', { shiftKey: true }))).toEqual({ x: 20, y: 0 });
    expect(constrainPointerDelta({ x: 1, y: -20 }, key('Shift', { shiftKey: true }))).toEqual({ x: 0, y: -20 });
    expect(constrainPointerDelta({ x: 1, y: 2 }, key(''))).toEqual({ x: 1, y: 2 });
    expect(additiveSelection(key('Control', { ctrlKey: true }))).toBe(true);
    expect(additiveSelection(key('Shift', { shiftKey: true }))).toBe(true);
    expect(additiveSelection(key(''))).toBe(false);
    hydrateActionBindings({ 'gesture.constrain': { keys: 'Alt+Control', scope: 'application', category: 'gestures' } });
    expect(matchesGesture(key('Alt', { altKey: true, ctrlKey: true, shiftKey: true }), 'constrain')).toBe(true);
    expect(matchesGesture(key('Shift', { shiftKey: true }), 'constrain')).toBe(false);
    expect(matchesGesture(key('Alt', { altKey: true }), 'constrain')).toBe(false);
  });
  it('identifies conflicts across shared scopes but permits independent context bindings', () => {
    const actions = configurableActions();
    const selectAll = actions.find((action) => action.id === 'editor.selectAll')!;
    expect(conflictingActions(selectAll, 'Ctrl+C', actions).map((action) => action.id)).toEqual(['editor.copy']);
    expect(conflictingActions(selectAll, 'Alt+Shift+R', actions).map((action) => action.id)).toEqual([
      'hud.startStopRecording',
    ]);
    expect(conflictingActions(selectAll, '', actions)).toEqual([]);
    expect(conflictingActions(selectAll, 'Ctrl+A', actions)).toEqual([]);
    const confirm = actions.find((action) => action.id === 'capture.confirm')!;
    expect(conflictingActions(confirm, 'Ctrl+A', actions)).toEqual([]);
    expect(conflictingActions(confirm, 'Shift', actions)).toEqual([]);
  });
  it('finds every affected action when reassigning a global shortcut', () => {
    const actions = configurableActions();
    const global = actions.find((action) => action.id === 'hud.startStopRecording')!;
    const conflicts = conflictingActions(global, 'Ctrl+C', actions, {
      'editor.undo': { keys: 'Ctrl+C', scope: 'application', category: 'editing' },
    });
    expect(conflicts.map((action) => action.id).sort()).toEqual(['editor.copy', 'editor.undo']);
  });
  it('checks aliases revived by restoring a default and ignores aliases of a customized binding', () => {
    const actions = configurableActions();
    const redo = actions.find((action) => action.id === 'editor.redo')!;
    const bindings: ActionBindings = {
      'editor.selectAll': { keys: 'Ctrl+Y', scope: 'application', category: 'editing' },
    };
    expect(conflictingActions(redo, redo.keys, actions, bindings).map((action) => action.id)).toEqual([
      'editor.selectAll',
    ]);
    expect(conflictingActions(redo, 'Ctrl+Shift+Z', actions, bindings)).toEqual([]);
  });
  it('does not treat cleared shortcuts or their former default aliases as conflicts', () => {
    const actions = configurableActions();
    const selectAll = actions.find((action) => action.id === 'editor.selectAll')!;
    expect(
      conflictingActions(selectAll, 'Ctrl+Y', actions, {
        'editor.redo': { keys: '', scope: 'application', category: 'editing' },
      }),
    ).toEqual([]);
  });
  it.each([
    'input',
    'textarea',
    'select',
    'div[contenteditable=true]',
    'div[role=textbox]',
    'div[data-shortcut-input]',
  ])('protects native text editing for %s', (selector) => {
    const tag = selector.split('[')[0]!;
    const element = document.createElement(tag);
    const attribute = selector.match(/\[([^=\]]+)(?:=([^\]]+))?\]/);
    if (attribute) element.setAttribute(attribute[1]!, attribute[2] ?? '');
    expect(shortcutTargetIsEditable(element)).toBe(true);
    expect(shortcutTargetIsEditable(null)).toBe(false);
    expect(shortcutTargetIsEditable(document.createElement('button'))).toBe(false);
  });
  it('provides one stable identity per configurable action and includes property commands', () => {
    const actions = configurableActions();
    expect(new Set(actions.map((action) => action.id)).size).toBe(actions.length);
    expect(actions.length).toBeGreaterThan(180);
    expect(actions.find((action) => action.id === 'setting:CaptionClipPanel.fontSize')?.contexts).toEqual([
      'video',
      'screenshot',
    ]);
    expect(actions.find((action) => action.id === 'setting:AudioPanel.normalizeAll')?.contexts).toEqual(['video']);
    expect(actions.some((action) => action.id === 'setting:SettingsPanel.language')).toBe(false);
    expect(PRIMARY_ACTIONS.filter((action) => action.scope === 'global')).toHaveLength(13);
    expect(PRIMARY_ACTIONS.filter((action) => action.scope === 'global' && action.keys)).toHaveLength(10);
    expect(
      PRIMARY_ACTIONS.filter((action) => action.id.startsWith('quickSnip.record')).map((action) => action.keys),
    ).toEqual(['', '', '']);
  });
  it('gives configured drag modifiers priority on a selected layer while keeping additive clicks elsewhere', () => {
    expect(pointerSelectionIsAdditive({ ctrlKey: true }, true)).toBe(true);
    expect(pointerSelectionIsAdditive({ shiftKey: true }, true)).toBe(false);
    expect(pointerSelectionIsAdditive({ shiftKey: true }, false)).toBe(true);
    hydrateActionBindings({ 'gesture.duplicate': { keys: 'Control', scope: 'application', category: 'gestures' } });
    expect(pointerSelectionIsAdditive({ ctrlKey: true }, true)).toBe(false);
    expect(pointerSelectionIsAdditive({ ctrlKey: true }, false)).toBe(true);
    expect(pointerSelectionIsAdditive({}, false)).toBe(false);
  });
});
