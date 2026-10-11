import { computed, onScopeDispose, ref, watch, type Ref } from 'vue';
import { capture } from '~/api/capture';
import type { EditorPresetDocument } from '~/api/types/editor-preset';
import type { EditorPreferenceDefaults } from './editor-default-types';
import { normalizeEditorPreferenceDefaults } from './editor-defaults';
import { useEditorResources } from '../resources/useEditorResources';
import type { EditorResources } from '../resources/editor-resource-types';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const serialized = (value: unknown) => JSON.stringify(value);

export function useEditorPresets(
  editorDefaults: Ref<EditorPreferenceDefaults>,
  resources: EditorResources = useEditorResources(),
) {
  const document = ref<EditorPresetDocument | null>(null);
  const baseline = ref('');
  const writes = new Set<Promise<void>>();
  let applying = false;
  let disposed = false;
  let generation = 0;
  let remembered = '';
  const activePreset = computed(() =>
    document.value?.presets.find((preset) => preset.id === document.value?.activePresetId),
  );
  const dirty = computed(() =>
    Boolean(
      activePreset.value && activePreset.value.id !== 'default' && baseline.value !== serialized(editorDefaults.value),
    ),
  );

  const applyDocument = (next: EditorPresetDocument, applyEditor = false) => {
    resources.rememberPresets('video', next);
    document.value = next;
    const selected = next.presets.find((preset) => preset.id === next.activePresetId);
    if (selected && applyEditor) {
      applying = true;
      editorDefaults.value = normalizeEditorPreferenceDefaults(clone(selected.settings.editor));
      remembered = serialized(editorDefaults.value);
      applying = false;
    }
    baseline.value = serialized(normalizeEditorPreferenceDefaults(selected?.settings.editor ?? editorDefaults.value));
  };

  const rememberPreferences = () => {
    if (applying || disposed || !activePreset.value) return;
    const editor = clone(editorDefaults.value);
    const value = serialized(editor);
    if (value === remembered) return;
    remembered = value;
    const current = ++generation;
    // Send each committed edit immediately. A window can close before another
    // debounce or project write finishes; named templates stay untouched.
    const writing = capture
      .updateEditorPreset('default', { editor })
      .then((next) => {
        if (!disposed && current === generation) applyDocument(next);
      })
      .catch((error) => {
        if (current === generation) remembered = '';
        throw error;
      })
      .finally(() => writes.delete(writing));
    writes.add(writing);
    void writing.catch((error) => console.error('[Beam editor] failed to remember preferences', error));
  };
  const flush = async () => {
    while (writes.size) await Promise.all(writes);
  };
  const load = async (applyEditor = false) => {
    if (writes.size) await flush();
    applyDocument(await resources.presets('video'), applyEditor);
  };
  const save = async () => {
    if (!activePreset.value) return;
    rememberPreferences();
    await flush();
    const preset = activePreset.value;
    if (!preset || preset.id === 'default') return;
    applyDocument(
      await capture.updateEditorPreset(preset.id, {
        ...clone(preset.settings),
        editor: clone(editorDefaults.value),
      }),
    );
  };
  const resolveDirty = async () => {
    await flush();
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
    await flush();
    applyDocument(await capture.renameEditorPreset(preset.id, name));
  };
  const remove = async () => {
    const preset = activePreset.value;
    if (!preset || preset.protected) return;
    await flush();
    applyDocument(await capture.deleteEditorPreset(preset.id), true);
  };

  watch(editorDefaults, rememberPreferences, { deep: true, flush: 'sync' });
  const unsubscribe = resources.onPresetsChanged('video', (next) => {
    if (!dirty.value && !writes.size) applyDocument(next);
  });
  onScopeDispose(() => {
    disposed = true;
    unsubscribe();
  });

  return {
    document,
    activePreset,
    dirty,
    load,
    save,
    flush,
    select,
    create,
    rename,
    remove,
  };
}
