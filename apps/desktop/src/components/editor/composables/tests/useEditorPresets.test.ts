import { effectScope, nextTick, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorPreferenceDefaults } from '../editor-default-types';
import { normalizeEditorPreferenceDefaults } from '../editor-defaults';
import { createElementText } from '@beam/engine/shared/element-text';
import { normalizeElementTextDefaults } from '../../elements/element-text-defaults';
import type { EditorPresetDocument, EditorPresetSettings } from '~/api/types/editor-preset';

const mocks = vi.hoisted(() => ({
  getEditorPresets: vi.fn(),
  updateEditorPreset: vi.fn(),
  selectEditorPreset: vi.fn(),
  createEditorPreset: vi.fn(),
  renameEditorPreset: vi.fn(),
  deleteEditorPreset: vi.fn(),
  onEditorPresetsChanged: vi.fn(),
}));

vi.mock('../../../../api/capture', () => ({ capture: mocks }));

import { useEditorPresets } from '../useEditorPresets';

const editor = (selectedBackgroundId: string | null = null): EditorPreferenceDefaults =>
  normalizeEditorPreferenceDefaults({
    presentation: {
      selectedBackgroundId,
      canvas: {
        preset: '16:9',
        width: 1920,
        height: 1080,
        showBackground: false,
        transitions: { entry: null, exit: null },
      },
      background: null,
      blurPercent: 0,
      cursor: {
        selection: {
          packId: 'builtin:macos',
          mode: 'automatic',
          cursorId: null,
        },
        size: 45,
        color: '#000000',
        shadow: {
          enabled: true,
          blur: 6,
          color: '#000000',
          direction: 'bottom',
        },
        clickEffects: {
          left: {
            springEnabled: true,
            springIntensity: 50,
            rippleEnabled: false,
            rippleStyle: 'single',
            rippleSize: 30,
            rippleColor: '#ff5a1f',
          },
          right: {
            springEnabled: true,
            springIntensity: 50,
            rippleEnabled: false,
            rippleStyle: 'single',
            rippleSize: 30,
            rippleColor: '#6366f1',
          },
        },
        motion: {
          preset: 'smooth',
          smoothing: 0.67,
          springMassMultiplier: 1.29,
          motionBlur: 0.4,
        },
        autoHide: { enabled: false, delaySeconds: 2, fadeDurationMs: 250 },
      },
    },
  });

const settings = (selectedBackgroundId: string | null = null): EditorPresetSettings => ({
  editor: editor(selectedBackgroundId),
  devices: { cameraId: 'off', micId: 'no-audio' },
  export: { format: 'mp4' },
  quickSnip: { automaticZoom: true },
});

const document = (activePresetId = 'default'): EditorPresetDocument => ({
  schemaVersion: 1,
  activePresetId,
  presets: [
    {
      id: 'default',
      name: 'Default',
      protected: true,
      updatedAt: '2026-01-01T00:00:00.000Z',
      settings: settings('default-background'),
    },
    {
      id: 'named',
      name: 'Named',
      protected: false,
      updatedAt: '2026-01-01T00:00:00.000Z',
      settings: settings('named-background'),
    },
  ],
});

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

let persisted: EditorPresetDocument;
const scopes: ReturnType<typeof effectScope>[] = [];
const setup = (activeId = 'default') => {
  persisted.activePresetId = activeId;
  const defaults = ref(normalizeEditorPreferenceDefaults(undefined));
  const scope = effectScope();
  scopes.push(scope);
  const controller = scope.run(() => useEditorPresets(defaults))!;
  return { defaults, controller, scope };
};
const saved = (id = 'default') => persisted.presets.find((preset) => preset.id === id)!;
const background = (id = 'default') => saved(id).settings.editor.presentation!.selectedBackgroundId;

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  persisted = document();
  mocks.getEditorPresets.mockImplementation(async () => clone(persisted));
  mocks.onEditorPresetsChanged.mockReturnValue(vi.fn());
  mocks.updateEditorPreset.mockImplementation(async (id: string, patch: Partial<EditorPresetSettings>) => {
    const preset = saved(id);
    if (!preset) throw new Error('Preset not found');
    preset.settings = { ...preset.settings, ...clone(patch) };
    return clone(persisted);
  });
  mocks.selectEditorPreset.mockImplementation(async (id: string) => {
    persisted.activePresetId = id;
    return clone(persisted);
  });
  mocks.createEditorPreset.mockImplementation(async (name: string) => {
    persisted.presets.push({ id: 'created', name, protected: false, updatedAt: '', settings: clone(saved().settings) });
    persisted.activePresetId = 'created';
    return clone(persisted);
  });
  mocks.renameEditorPreset.mockImplementation(async (id: string, name: string) => {
    saved(id).name = name;
    return clone(persisted);
  });
  mocks.deleteEditorPreset.mockImplementation(async (id: string) => {
    persisted.presets = persisted.presets.filter((preset) => preset.id !== id);
    persisted.activePresetId = 'default';
    return clone(persisted);
  });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(window, 'prompt').mockImplementation(() => {
    throw new Error('Use the preset dialog.');
  });
});
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop());
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('useEditorPresets', () => {
  it('remembers black shape typography immediately and restores it in a new editor', async () => {
    const { defaults, controller } = setup();
    await controller.load(true);
    const text = createElementText('Previous words');
    text.style = { ...text.style, color: '#000000', fontSize: 64, fontFamily: 'Inter' };
    defaults.value.elementText = normalizeElementTextDefaults(text);
    expect(mocks.updateEditorPreset).toHaveBeenCalledExactlyOnceWith('default', { editor: clone(defaults.value) });
    expect(controller.dirty.value).toBe(false);
    await controller.flush();
    const next = setup();
    await next.controller.load(true);
    expect(next.defaults.value.elementText?.style).toMatchObject({
      color: '#000000',
      fontSize: 64,
      fontFamily: 'Inter',
    });
    expect(next.defaults.value.elementText).not.toHaveProperty('content');
  });

  it('never asks to save Default before switching and uses its latest values when returning', async () => {
    const { defaults, controller } = setup();
    await controller.load(true);
    defaults.value.presentation!.selectedBackgroundId = 'latest-background';
    await controller.select('named');
    expect(window.confirm).not.toHaveBeenCalled();
    expect(defaults.value.presentation!.selectedBackgroundId).toBe('named-background');
    await controller.select('default');
    expect(defaults.value.presentation!.selectedBackgroundId).toBe('latest-background');
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('remembers edits made with a named template without overwriting that template', async () => {
    const { defaults, controller } = setup('named');
    await controller.load(true);
    defaults.value.presentation!.selectedBackgroundId = 'edited-background';
    await controller.flush();
    expect(background()).toBe('edited-background');
    expect(background('named')).toBe('named-background');
    expect(controller.dirty.value).toBe(true);
    expect(mocks.updateEditorPreset.mock.calls.every(([id]) => id === 'default')).toBe(true);
    await controller.save();
    expect(background('named')).toBe('edited-background');
    expect(controller.dirty.value).toBe(false);
  });

  it('keeps named templates unchanged on Discard while Default retains the latest used settings', async () => {
    const { defaults, controller } = setup('named');
    await controller.load(true);
    defaults.value.presentation!.selectedBackgroundId = 'last-used';
    vi.mocked(window.confirm).mockReturnValueOnce(false).mockReturnValueOnce(true);
    await controller.select('default');
    expect(background('named')).toBe('named-background');
    expect(defaults.value.presentation!.selectedBackgroundId).toBe('last-used');
  });

  it('keeps the active template on Cancel and saves it explicitly when requested', async () => {
    const { defaults, controller } = setup('named');
    await controller.load(true);
    defaults.value.presentation!.selectedBackgroundId = 'keep-editing';
    vi.mocked(window.confirm).mockReturnValueOnce(false).mockReturnValueOnce(false);
    await controller.select('default');
    expect(mocks.selectEditorPreset).not.toHaveBeenCalled();
    expect(controller.activePreset.value?.id).toBe('named');
    vi.mocked(window.confirm).mockReturnValueOnce(true);
    await controller.select('default');
    expect(background('named')).toBe('keep-editing');
    expect(defaults.value.presentation!.selectedBackgroundId).toBe('keep-editing');
  });

  it.each(['reload', 'switch'] as const)('waits for an in-flight preference write before %s', async (action) => {
    const { defaults, controller } = setup();
    await controller.load(true);
    let complete!: () => void;
    const update = mocks.updateEditorPreset.getMockImplementation()!;
    mocks.updateEditorPreset.mockImplementationOnce(async (...args) => {
      const next = await update(...args);
      await new Promise<void>((resolve) => {
        complete = resolve;
      });
      return next;
    });
    defaults.value.presentation!.selectedBackgroundId = 'saved-before-navigation';
    await Promise.resolve();
    const navigating = action === 'reload' ? controller.load(true) : controller.select('named');
    await Promise.resolve();
    expect(defaults.value.presentation!.selectedBackgroundId).toBe('saved-before-navigation');
    expect(mocks.selectEditorPreset).not.toHaveBeenCalled();
    complete();
    await navigating;
    expect(defaults.value.presentation!.selectedBackgroundId).toBe(
      action === 'reload' ? 'saved-before-navigation' : 'named-background',
    );
    expect(background()).toBe('saved-before-navigation');
  });

  it('sends preferences before scope disposal and ignores the late response', async () => {
    const { defaults, controller, scope } = setup();
    await controller.load(true);
    let complete!: () => void;
    const update = mocks.updateEditorPreset.getMockImplementation()!;
    mocks.updateEditorPreset.mockImplementationOnce(async (...args) => {
      const next = await update(...args);
      await new Promise<void>((resolve) => {
        complete = resolve;
      });
      return next;
    });
    defaults.value.presentation!.selectedBackgroundId = 'before-close';
    await Promise.resolve();
    scope.stop();
    complete();
    await controller.flush();
    expect(background()).toBe('before-close');
    expect(controller.document.value!.presets[0]!.settings.editor.presentation!.selectedBackgroundId).toBe(
      'default-background',
    );
  });

  it('ignores obsolete responses when two committed edits finish out of order', async () => {
    const { defaults, controller } = setup();
    await controller.load(true);
    const updates: Array<() => void> = [];
    const update = mocks.updateEditorPreset.getMockImplementation()!;
    mocks.updateEditorPreset.mockImplementation(async (...args) => {
      const next = await update(...args);
      await new Promise<void>((resolve) => updates.push(resolve));
      return next;
    });
    defaults.value.presentation!.selectedBackgroundId = 'first';
    defaults.value.presentation!.selectedBackgroundId = 'last';
    await Promise.resolve();
    updates[1]!();
    await nextTick();
    updates[0]!();
    await controller.flush();
    expect(background()).toBe('last');
    expect(controller.document.value!.presets[0]!.settings.editor.presentation!.selectedBackgroundId).toBe('last');
  });

  it('does not rewrite normalized preferences merely by loading or repeating an unchanged edit', async () => {
    const { defaults, controller } = setup();
    await controller.load(true);
    defaults.value = clone(defaults.value);
    expect(mocks.updateEditorPreset).not.toHaveBeenCalled();
    expect(controller.dirty.value).toBe(false);
  });

  it('reports write failures and retries the current preferences on Save', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { defaults, controller } = setup();
    await controller.load(true);
    mocks.updateEditorPreset.mockRejectedValueOnce(new Error('disk unavailable'));
    defaults.value.presentation!.selectedBackgroundId = 'retry-this';
    await expect(controller.flush()).rejects.toThrow('disk unavailable');
    expect(log).toHaveBeenCalledWith('[Beam editor] failed to remember preferences', expect.any(Error));
    await controller.save();
    expect(background()).toBe('retry-this');
  });

  it('creates a named snapshot of the latest preferences and protects Default from rename/delete', async () => {
    const { defaults, controller } = setup();
    await controller.load(true);
    await controller.rename('Forbidden');
    await controller.remove();
    expect(mocks.renameEditorPreset).not.toHaveBeenCalled();
    expect(mocks.deleteEditorPreset).not.toHaveBeenCalled();
    defaults.value.presentation!.selectedBackgroundId = 'template-snapshot';
    await controller.create('  Tutorial  ');
    expect(saved('created').name).toBe('Tutorial');
    expect(background('created')).toBe('template-snapshot');
    expect(window.confirm).not.toHaveBeenCalled();
    await controller.rename('  Renamed  ');
    expect(saved('created').name).toBe('Renamed');
    await controller.remove();
    expect(controller.activePreset.value?.id).toBe('default');
  });

  it('ignores blank names and unavailable preset actions', async () => {
    const { defaults, controller } = setup();
    defaults.value = editor('unloaded');
    await controller.save();
    await controller.rename('Unused');
    await controller.remove();
    expect(mocks.updateEditorPreset).not.toHaveBeenCalled();
    await controller.load(true);
    await controller.create('   ');
    await controller.select('named');
    await controller.rename('   ');
    expect(mocks.createEditorPreset).not.toHaveBeenCalled();
    expect(mocks.renameEditorPreset).not.toHaveBeenCalled();
    expect(window.prompt).not.toHaveBeenCalled();
  });

  it('accepts catalogue metadata updates when clean without teaching them as user edits', async () => {
    const { defaults, controller } = setup();
    await controller.load(true);
    const changed = clone(persisted);
    changed.presets[0]!.settings.export = { format: 'webm' };
    const listener = mocks.onEditorPresetsChanged.mock.calls[0]![0];
    listener(changed);
    expect(controller.activePreset.value?.settings.export.format).toBe('webm');
    expect(mocks.updateEditorPreset).not.toHaveBeenCalled();
    expect(defaults.value.presentation!.selectedBackgroundId).toBe('default-background');
  });

  it('keeps unsaved named settings when a catalogue update arrives', async () => {
    const { defaults, controller } = setup('named');
    await controller.load(true);
    defaults.value.presentation!.selectedBackgroundId = 'unsaved';
    await controller.flush();
    const changed = clone(persisted);
    changed.activePresetId = 'default';
    mocks.onEditorPresetsChanged.mock.calls[0]![0](changed);
    expect(controller.activePreset.value?.id).toBe('named');
    expect(defaults.value.presentation!.selectedBackgroundId).toBe('unsaved');
    expect(controller.dirty.value).toBe(true);
  });

  it('ignores catalogue updates during preference persistence', async () => {
    const { defaults, controller } = setup();
    await controller.load(true);
    let complete!: (document: EditorPresetDocument) => void;
    mocks.updateEditorPreset.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    defaults.value.presentation!.selectedBackgroundId = 'pending';
    const changed = document('named');
    mocks.onEditorPresetsChanged.mock.calls[0]![0](changed);
    expect(controller.activePreset.value?.id).toBe('default');
    complete(clone(persisted));
    await controller.flush();
  });

  it('leaves defaults intact if the catalogue has no selected preset', async () => {
    persisted.activePresetId = 'missing';
    mocks.getEditorPresets.mockResolvedValueOnce(clone(persisted));
    const { defaults, controller } = setup();
    const initial = clone(defaults.value);
    await controller.load(true);
    expect(controller.activePreset.value).toBeUndefined();
    expect(controller.dirty.value).toBe(false);
    expect(defaults.value).toEqual(initial);
    await controller.save();
    expect(mocks.updateEditorPreset).not.toHaveBeenCalled();
  });
});
