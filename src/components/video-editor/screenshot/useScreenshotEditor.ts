import { provideElementEditor } from '../elements/useElementEditor';
import { useTranslate } from '~/i18n/useTranslate';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useToastStore } from '~/ui/toast/toastStore';
import type { ScreenshotPanel } from './screenshot-types';
import type { CaptureProject } from '~/api/types/capture-api';
import { capture } from '~/api/capture';
import type { ScreenshotDocument, ScreenshotState } from '~/api/types/screenshot';
import type { ClipAppearance, NormalizedTransform } from '~/media/shared/composition-types';
import type { EditorPresetDocument } from '~/api/types/editor-preset';
import { BACKGROUND_MEDIA, groupBackgroundMedia, type BackgroundMedia } from '../composables/backgroundCatalog';
import { screenshotState, screenshotPresetSettings } from './screenshot-state';
import { encodeScreenshot } from './screenshot-render';
import { propertyInteractionActive } from '~/composables/property-interaction';
import { useScreenshotHistory } from './useScreenshotHistory';
import { useScreenshotCursors } from './useScreenshotCursors';
import { useScreenshotLayerShortcuts } from './useScreenshotLayerShortcuts';
import { screenshotImage, createScreenshotImage } from './screenshot-images';
import { createScreenshotImageLoader } from './screenshot-assets';
import { validScreenshotDimensions } from './screenshot-dimensions';
import {
  initializeScreenshotComposition,
  insertScreenshotLayer,
  removeScreenshotLayer,
  screenshotLayers,
  SCREENSHOT_BACKGROUND_ID,
  SCREENSHOT_WATERMARK_ID,
} from './screenshot-layers';

export function useScreenshotEditor(id: () => string, ready: () => void) {
  const { t } = useTranslate('ScreenshotEditor');
  const toast = useToastStore();
  const document = ref<ScreenshotDocument | null>(null);
  const state = ref<ScreenshotState | null>(null);
  const presets = ref<EditorPresetDocument | null>(null);
  const backgroundLibrary = ref<BackgroundMedia[]>([]);
  const selectedId = ref<string | null>(null);
  const panel = ref<ScreenshotPanel>('canvas');
  const cropping = ref(false);
  const advanced = ref(false);
  const keepAspect = ref(true);
  const error = ref('');
  const busy = ref(false);
  const copied = ref(false);
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let saveQueue = Promise.resolve();
  let generation = 0;
  let applyingPreset = false;
  let baseline = '';
  const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  const fail = (reason: unknown) => {
    error.value = reason instanceof Error ? reason.message : String(reason);
  };
  const backgrounds = computed(() =>
    groupBackgroundMedia([...BACKGROUND_MEDIA, ...backgroundLibrary.value].filter((item) => item.kind === 'image')),
  );
  const activePreset = computed(() => presets.value?.presets.find((item) => item.id === presets.value?.activePresetId));
  const settings = () => screenshotPresetSettings(state.value!, activePreset.value?.settings ?? document.value!.preset);
  const dirty = computed(() => Boolean(state.value && activePreset.value && JSON.stringify(settings()) !== baseline));
  const selectedShape = computed(() => state.value?.shapes.find((shape) => shape.id === selectedId.value));
  const selectedLayer = computed(() =>
    state.value ? screenshotLayers(state.value).find((layer) => layer.id === selectedId.value) : undefined,
  );
  const image = computed(() => (state.value ? screenshotImage(state.value, selectedId.value) : undefined));
  const selectedImage = computed(() =>
    image.value
      ? {
          ...image.value,
          ...image.value.appearance,
          clipTransform: image.value.transform,
        }
      : null,
  );
  const save = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    if (!document.value || !state.value) return saveQueue;
    const id = document.value.id,
      snapshot = plain(state.value);
    history.commitNow(snapshot);
    const savedHistory = history.serialize();
    saveQueue = saveQueue.catch(() => undefined).then(() => capture.saveScreenshot(id, snapshot, savedHistory));
    return saveQueue;
  };
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
    const { shapes, cursors, images, composition } = state.value;
    const crop = state.value.image.crop;
    applyingPreset = true;
    state.value = {
      ...screenshotState({ ...plain(document.value), preset: selected.settings, state: null }, backgroundLibrary.value),
      shapes,
      cursors,
      images,
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
  const select = (id: string | null) => {
    selectedId.value = id;
    panel.value =
      id === state.value?.image.id
        ? 'image'
        : state.value?.cursors?.some((cursor) => cursor.id === id)
          ? 'cursor'
          : !id || id === SCREENSHOT_BACKGROUND_ID || id === SCREENSHOT_WATERMARK_ID
            ? 'canvas'
            : 'shapes';
    cropping.value = false;
  };
  const transform = (value: NormalizedTransform) => {
    if (selectedLayer.value?.locked) return;
    if (cursors.selected.value) cursors.transform(value);
    else if (selectedShape.value) selectedShape.value.transform = value;
    else if (image.value) image.value.transform = value;
  };
  const appearance = (value: Partial<ClipAppearance>) => {
    if (image.value) image.value.appearance = { ...image.value.appearance, ...value };
  };
  const addImage = async () => {
    if (!document.value || !state.value || busy.value || cropping.value) return;
    elements.finishText();
    elements.drawingMode.value = false;
    busy.value = true;
    const current = generation;
    const projectId = document.value.id;
    let importedSource: string | undefined;
    let inserted = false;
    try {
      const asset = await capture.pickScreenshotImage(projectId);
      importedSource = asset?.src;
      if (!asset || current !== generation) return;
      const decoded = await createScreenshotImageLoader()(asset.src);
      if (current !== generation || !state.value) return;
      if (!validScreenshotDimensions({ width: decoded.naturalWidth, height: decoded.naturalHeight }))
        throw new Error(t('dimensionsError'));
      const layer = createScreenshotImage(asset, decoded.naturalWidth, decoded.naturalHeight, state.value.canvas);
      initializeScreenshotComposition(state.value);
      (state.value.images ??= []).push(layer);
      insertScreenshotLayer(state.value, layer.id);
      inserted = true;
      select(layer.id);
    } catch (reason) {
      fail(reason);
    } finally {
      if (importedSource && !inserted) await capture.discardScreenshotImage(projectId, importedSource).catch(fail);
      busy.value = false;
    }
  };
  const removeShape = () => {
    if (!state.value || !selectedShape.value) return;
    removeScreenshotLayer(state.value, selectedShape.value.id);
    selectedId.value = state.value.shapes.at(-1)?.id ?? null;
    panel.value = 'shapes';
  };
  const elements = provideElementEditor({
    addImage,
    layers: () => state.value?.shapes ?? [],
    selectedId: () => selectedId.value,
    select,
    insert: (clip) => {
      if (!state.value) return;
      initializeScreenshotComposition(state.value);
      state.value.shapes.push(clip);
      insertScreenshotLayer(state.value, clip.id);
    },
    update: (id, patch) => {
      const clip = state.value?.shapes.find((c) => c.id === id);
      if (clip) Object.assign(clip, patch);
    },
    remove: () => removeShape(),
    timing: () => ({ startMs: 0, durationMs: 1 }),
    canInteract: () => !busy.value && !cropping.value && !selectedLayer.value?.locked,
  });
  const cursors = useScreenshotCursors(state, selectedId, select, fail);
  const history = useScreenshotHistory(state, {
    disabled: () => busy.value || Boolean(elements.editing.value),
    restore: () => {
      cropping.value = false;
      if (selectedId.value && !screenshotLayers(state.value!).some((layer) => layer.id === selectedId.value))
        select(null);
    },
  });
  useScreenshotLayerShortcuts(
    () => selectedLayer.value,
    () => busy.value || cropping.value || Boolean(elements.editing.value) || elements.drawingMode.value,
    (id) => {
      if (!state.value) return;
      removeScreenshotLayer(state.value, id);
      select(null);
    },
  );
  watch(panel, (next) => {
    if (next !== 'shapes') elements.drawingMode.value = false;
  });
  const exportImage = async (copy: boolean) => {
    if (!document.value || !state.value || busy.value) return;
    elements.finishText();
    busy.value = true;
    error.value = '';
    copied.value = false;
    try {
      await save();
      const snapshot = plain(state.value);
      const format = copy ? 'png' : snapshot.format;
      const bytes = await encodeScreenshot(document.value.source, { ...snapshot, format });
      await capture.exportScreenshot(document.value.id, bytes, format, copy);
      copied.value = copy;
      if (copy) toast.success(t('copiedToast'), 5000);
    } catch (reason) {
      fail(reason);
    } finally {
      busy.value = false;
    }
  };
  const leave = async (navigate: () => unknown | Promise<unknown>) => {
    if (busy.value) return;
    elements.finishText();
    busy.value = true;
    try {
      await save();
      if (activePreset.value?.id === 'default' && dirty.value) await savePreset();
      await navigate();
    } catch (reason) {
      fail(reason);
    } finally {
      busy.value = false;
    }
  };
  const back = () => leave(() => capture.showHud());
  const openProject = (project: CaptureProject) =>
    leave(() => (project.mode === 'screenshot' ? capture.openScreenshot(project.id) : capture.openEditor(project.id)));
  const deleteProject = (project: CaptureProject) => {
    if (project.mode !== 'screenshot' || document.value?.id !== project.id) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    document.value = null;
    state.value = null;
    capture.showHud();
  };
  const renameProject = (project: CaptureProject) => {
    if (document.value?.id === project.id) document.value.name = project.name;
  };
  watch(
    [state, propertyInteractionActive],
    () => {
      if (!state.value || applyingPreset) return;
      if (saveTimer) clearTimeout(saveTimer);
      if (propertyInteractionActive.value) return;
      saveTimer = setTimeout(() => {
        void save().catch(fail);
        if (activePreset.value?.id === 'default' && dirty.value) void savePreset().catch(fail);
      }, 400);
    },
    { deep: true },
  );
  onMounted(async () => {
    const current = ++generation;
    try {
      capture.reportEditorLoadingStage('loadingProject');
      const [next, library, presetDocument] = await Promise.all([
        capture.getScreenshot(id()),
        capture.listBackgroundLibrary(),
        capture.getEditorPresets('screenshot'),
      ]);
      if (current !== generation) return;
      // Persisted state and history move into their respective owners below.
      // Keep only metadata here, rather than retaining a second edit history.
      const { state: _state, history: savedHistory, ...metadata } = next;
      document.value = { ...metadata, state: null };
      backgroundLibrary.value = library;
      presets.value = presetDocument;
      const initial = screenshotState(next, library);
      initializeScreenshotComposition(initial);
      state.value = initial;
      history.initialize(initial, savedHistory, 'transfer');
      baseline = JSON.stringify(settings());
    } catch (reason) {
      if (current === generation) {
        fail(reason);
        ready();
      }
    }
  });
  onBeforeUnmount(() => {
    generation++;
    elements.finishText();
    void save().catch(fail);
    if (activePreset.value?.id === 'default' && dirty.value) void savePreset().catch(fail);
  });

  const selectPanel = (next: string) => {
    if (next === 'image') select(state.value?.image.id ?? null);
    else if (next === 'canvas') select(null);
    else if (next === 'shapes' || next === 'settings') {
      panel.value = next;
      cropping.value = false;
      const importedImageSelected = image.value && image.value.id !== state.value?.image.id;
      if (next === 'shapes' && !selectedShape.value && !importedImageSelected)
        selectedId.value = state.value?.shapes.at(-1)?.id ?? null;
    }
  };
  return {
    document,
    state,
    presets,
    backgroundLibrary,
    selectedId,
    panel,
    cropping,
    advanced,
    keepAspect,
    error,
    busy,
    copied,
    backgrounds,
    dirty,
    selectedShape,
    selectedImage,
    image,
    addImage,
    fail,
    savePreset,
    presetAction,
    select,
    selectPanel,
    transform,
    appearance,
    removeShape,
    exportImage,
    back,
    openProject,
    renameProject,
    deleteProject,
    cursors,
    selectedLayer,
    history,
  };
}
