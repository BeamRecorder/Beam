import { computed, onScopeDispose, ref, watch, type Ref } from 'vue';
import { capture } from '~/api/capture';
import type { EditorPresetDocument, EditorPresetSettings } from '~/api/types/editor-preset';
import type { EditorPreferenceDefaults } from './editor-default-types';
import { normalizeEditorPreferenceDefaults } from './editor-defaults';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const serialized = (value: unknown) => JSON.stringify(value);

export function useEditorPresets(editorDefaults: Ref<EditorPreferenceDefaults>) {
  const document = ref<EditorPresetDocument | null>(null);
  const baseline = ref('');
  const activePreset = computed(() =>
    document.value?.presets.find((preset) => preset.id === document.value?.activePresetId),
  );
  const dirty = computed(() => Boolean(activePreset.value && baseline.value !== serialized(editorDefaults.value)));

  const applyDocument = (next: EditorPresetDocument, applyEditor = false) => {
    document.value = next;
    const selected = next.presets.find((preset) => preset.id === next.activePresetId);
    if (selected && applyEditor)
      editorDefaults.value = normalizeEditorPreferenceDefaults(clone(selected.settings.editor));
    baseline.value = serialized(selected?.settings.editor ?? editorDefaults.value);
  };

  const load = async (applyEditor = false) => applyDocument(await capture.getEditorPresets(), applyEditor);
  const settings = (): EditorPresetSettings => ({
    ...(clone(activePreset.value?.settings) ?? {
      devices: {},
      export: { format: 'mp4' },
      quickSnip: { automaticZoom: true },
    }),
    editor: clone(editorDefaults.value),
  });
  const save = async () => {
    if (!activePreset.value) return;
    applyDocument(await capture.updateEditorPreset(activePreset.value.id, settings()));
  };
  const resolveDirty = async () => {
    if (!dirty.value) return true;
    if (window.confirm('Save changes to the current editor preset?')) {
      await save();
      return true;
    }
    return window.confirm('Discard the unsaved preset changes? Select Cancel to stay on this preset.');
  };
  const select = async (id: string | number) => {
    if (!(await resolveDirty())) return;
    applyDocument(await capture.selectEditorPreset(String(id)), true);
  };
  const create = async (requestedName: string) => {
    if (!(await resolveDirty())) return;
    const name = requestedName.trim();
    if (!name) return;
    applyDocument(await capture.createEditorPreset(name), true);
  };
  const rename = async (requestedName: string) => {
    const preset = activePreset.value;
    if (!preset || preset.protected) return;
    const name = requestedName.trim();
    if (!name) return;
    applyDocument(await capture.renameEditorPreset(preset.id, name));
  };
  const remove = async () => {
    const preset = activePreset.value;
    if (!preset || preset.protected) return;
    applyDocument(await capture.deleteEditorPreset(preset.id), true);
  };

  let autoSave: ReturnType<typeof setTimeout> | null = null;
  watch(
    editorDefaults,
    () => {
      if (activePreset.value?.id !== 'default' || !dirty.value) return;
      if (autoSave) clearTimeout(autoSave);
      autoSave = setTimeout(() => void save().catch(() => undefined), 250);
    },
    { deep: true },
  );
  const unsubscribe = capture.onEditorPresetsChanged((next) => {
    if (!dirty.value) applyDocument(next);
  });
  onScopeDispose(() => {
    if (autoSave) clearTimeout(autoSave);
    unsubscribe();
  });

  return {
    document,
    activePreset,
    dirty,
    load,
    save,
    select,
    create,
    rename,
    remove,
  };
}
