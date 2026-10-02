import { computed } from 'vue';
import { capture } from '~/api/capture';
import { screenshotState, screenshotPresetSettings } from './screenshot-state';
import type { EditorPresetDocument } from '~/api/types/editor-preset';
import type { ScreenshotPresetHost } from './screenshot-preset-types';

export function useScreenshotPresets(host: ScreenshotPresetHost) {
  const { document, state, presets, backgroundLibrary, busy, t, fail } = host;
  const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  let baseline = '',
    applyingPreset = false;
  const activePreset = computed(() => presets.value?.presets.find((item) => item.id === presets.value?.activePresetId));
  const settings = () => screenshotPresetSettings(state.value!, activePreset.value?.settings ?? document.value!.preset);
  const dirty = computed(() => Boolean(state.value && activePreset.value && JSON.stringify(settings()) !== baseline));
  const savePreset = async () => {
    if (!activePreset.value || !state.value) return;
    const next = plain(settings());
    const id = activePreset.value.id;
    const updated = await capture.updateEditorPreset(id, next, 'screenshot');
    if (activePreset.value?.id === id) {
      presets.value = updated;
      baseline = JSON.stringify(next);
    }
  };
  const applyPreset = (next: EditorPresetDocument) => {
    presets.value = next;
    const selected = next.presets.find((item) => item.id === next.activePresetId);
    if (!document.value || !state.value || !selected) return;
    const { shapes, cursors, images, effects, composition } = state.value;
    const crop = state.value.image.crop;
    applyingPreset = true;
    state.value = {
      ...screenshotState({ ...plain(document.value), preset: selected.settings, state: null }, backgroundLibrary.value),
      shapes,
      cursors,
      images,
      effects,
      composition,
    };
    state.value.image.crop = crop;
    baseline = JSON.stringify(settings());
    applyingPreset = false;
  };
  const presetAction = async (action: 'select' | 'add' | 'rename' | 'delete', value = '') => {
    if (busy.value) return;
    busy.value = true;
    try {
      if ((action === 'select' || action === 'delete') && activePreset.value?.id !== 'default' && dirty.value) {
        if (window.confirm(t('savePreset'))) await savePreset();
        else if (!window.confirm(t('discardPreset'))) return;
      }
      if (action === 'rename' && activePreset.value)
        presets.value = await capture.renameEditorPreset(activePreset.value.id, value, 'screenshot');
      else if (action === 'add') {
        const current = plain(settings());
        const next = await capture.createEditorPreset(value, 'screenshot');
        applyPreset(await capture.updateEditorPreset(next.activePresetId, current, 'screenshot'));
      } else {
        // Default follows the user's last edits; named presets change only with Save.
        if (activePreset.value?.id === 'default' && dirty.value) await savePreset();
        applyPreset(
          action === 'select'
            ? await capture.selectEditorPreset(value, 'screenshot')
            : await capture.deleteEditorPreset(activePreset.value!.id, 'screenshot'),
        );
      }
    } catch (reason) {
      fail(reason);
    } finally {
      busy.value = false;
    }
  };
  return {
    activePreset,
    dirty,
    savePreset,
    presetAction,
    initializeBaseline: () => {
      baseline = JSON.stringify(settings());
    },
    isApplyingPreset: () => applyingPreset,
  };
}
