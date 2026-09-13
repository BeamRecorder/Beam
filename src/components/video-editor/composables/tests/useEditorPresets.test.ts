import { nextTick, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorPreferenceDefaults } from '../editor-default-types';
import { normalizeEditorPreferenceDefaults } from '../editor-defaults';
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
        selection: { packId: 'builtin:macos', mode: 'automatic', cursorId: null },
        size: 45,
        color: '#000000',
        shadow: { enabled: true, blur: 6, color: '#000000', direction: 'bottom' },
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
        motion: { preset: 'smooth', smoothing: 0.67, springMassMultiplier: 1.29, motionBlur: 0.4 },
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

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.onEditorPresetsChanged.mockReturnValue(vi.fn());
  mocks.updateEditorPreset.mockImplementation(async (id: string, next: EditorPresetSettings) => {
    const current = document(id === 'named' ? 'named' : 'default');
    const preset = current.presets.find((candidate) => candidate.id === id);
    if (!preset) throw new Error('Preset not found');
    preset.settings = clone(next);
    return current;
  });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(window, 'prompt').mockImplementation(() => {
    throw new Error('Editor preset CRUD must not use window.prompt.');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('useEditorPresets', () => {
  it('auto-saves changes made to the protected Default preset', async () => {
    const defaults = ref(editor('default-background'));
    const controller = useEditorPresets(defaults);
    mocks.getEditorPresets.mockResolvedValue(document());

    await controller.load();
    defaults.value.presentation!.selectedBackgroundId = 'changed-background';
    await nextTick();
    await vi.advanceTimersByTimeAsync(250);

    expect(mocks.updateEditorPreset).toHaveBeenCalledWith(
      'default',
      expect.objectContaining({
        editor: expect.objectContaining({
          presentation: expect.objectContaining({ selectedBackgroundId: 'changed-background' }),
        }),
      }),
    );
    expect(controller.dirty.value).toBe(false);
  });

  it('marks a named preset dirty and saves the current editor settings explicitly', async () => {
    const defaults = ref(editor('named-background'));
    const controller = useEditorPresets(defaults);
    mocks.getEditorPresets.mockResolvedValue(document('named'));

    await controller.load();
    defaults.value.presentation!.selectedBackgroundId = 'edited-background';
    await nextTick();
    expect(controller.dirty.value).toBe(true);

    await controller.save();

    expect(mocks.updateEditorPreset).toHaveBeenCalledWith(
      'named',
      expect.objectContaining({
        devices: { cameraId: 'off', micId: 'no-audio' },
        export: { format: 'mp4' },
        editor: expect.objectContaining({
          presentation: expect.objectContaining({ selectedBackgroundId: 'edited-background' }),
        }),
      }),
    );
    expect(controller.dirty.value).toBe(false);
  });

  it('offers Save, Discard, or Cancel before changing presets', async () => {
    const defaults = ref(editor('default-background'));
    const controller = useEditorPresets(defaults);
    mocks.getEditorPresets.mockResolvedValue(document());
    mocks.selectEditorPreset.mockImplementation(async (id: string) => document(id));
    mocks.updateEditorPreset.mockResolvedValue(document());
    await controller.load();

    defaults.value.presentation!.selectedBackgroundId = 'save-me';
    const confirm = vi.mocked(window.confirm);
    confirm.mockReturnValueOnce(true);
    await controller.select('named');
    expect(mocks.updateEditorPreset).toHaveBeenCalledOnce();
    expect(mocks.selectEditorPreset).toHaveBeenCalledWith('named');

    defaults.value.presentation!.selectedBackgroundId = 'discard-me';
    confirm.mockReset();
    confirm.mockReturnValueOnce(false).mockReturnValueOnce(true);
    await controller.select('default');
    expect(mocks.selectEditorPreset).toHaveBeenCalledWith('default');
    expect(mocks.updateEditorPreset).toHaveBeenCalledOnce();

    defaults.value.presentation!.selectedBackgroundId = 'cancel-me';
    confirm.mockReset();
    confirm.mockReturnValueOnce(false).mockReturnValueOnce(false);
    await controller.select('named');
    expect(mocks.selectEditorPreset).toHaveBeenCalledTimes(2);
  });

  it('keeps Default protected while allowing named preset CRUD through the controller', async () => {
    const defaults = ref(editor('default-background'));
    const controller = useEditorPresets(defaults);
    mocks.getEditorPresets.mockResolvedValue(document());
    mocks.createEditorPreset.mockResolvedValue(document('named'));
    mocks.renameEditorPreset.mockResolvedValue(document('named'));
    mocks.deleteEditorPreset.mockResolvedValue(document());
    await controller.load();

    await controller.rename('Should not rename Default');
    await controller.remove();
    expect(mocks.renameEditorPreset).not.toHaveBeenCalled();
    expect(mocks.deleteEditorPreset).not.toHaveBeenCalled();

    await controller.create('  Created  ');
    expect(mocks.createEditorPreset).toHaveBeenCalledWith('Created');

    await controller.rename('  Renamed  ');
    expect(mocks.renameEditorPreset).toHaveBeenCalledWith('named', 'Renamed');

    const confirm = vi.mocked(window.confirm);
    confirm.mockReturnValue(true);
    await controller.remove();
    expect(mocks.deleteEditorPreset).toHaveBeenCalledWith('named');
  });

  it('ignores empty names without invoking IPC or window.prompt', async () => {
    const defaults = ref(editor('default-background'));
    const controller = useEditorPresets(defaults);
    mocks.getEditorPresets.mockResolvedValue(document());
    await controller.load();

    await controller.create('   ');
    await controller.rename('   ');

    expect(mocks.createEditorPreset).not.toHaveBeenCalled();
    expect(mocks.renameEditorPreset).not.toHaveBeenCalled();
    expect(window.prompt).not.toHaveBeenCalled();
  });
});
