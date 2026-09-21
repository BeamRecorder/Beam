import { useScreenshotEffects } from './useScreenshotEffects';
import { editorTitle } from '../editor-window-title';
import { provideElementEditor } from '../elements/useElementEditor';
import { useTranslate } from '~/i18n/useTranslate';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useToastStore } from '~/ui/toast/toastStore';
import type { ScreenshotPanel, ScreenshotSelectionMode, ScreenshotTranslation } from './screenshot-types';
import type { CanvasMarqueeSelection } from '../canvas/canvas-marquee-types';
import { useScreenshotSelection } from './useScreenshotSelection';
import { applyScreenshotTranslation } from './screenshot-selection-transform';
import type { CaptureProject } from '~/api/types/capture-api';
import { capture } from '~/api/capture';
import type { ScreenshotDocument, ScreenshotState } from '~/api/types/screenshot';
import type { ClipAppearance, MediaAsset, NormalizedTransform } from '~/media/shared/composition-types';
import type { EditorPresetDocument } from '~/api/types/editor-preset';
import { BACKGROUND_MEDIA, groupBackgroundMedia, type BackgroundMedia } from '../composables/backgroundCatalog';
import { screenshotState, screenshotPresetSettings } from './screenshot-state';
import { encodeScreenshot } from './screenshot-render';
import {
  beginPropertyInteraction,
  endPropertyInteraction,
  propertyInteractionActive,
} from '~/composables/property-interaction';
import { useScreenshotHistory } from './useScreenshotHistory';
import { useScreenshotCursors } from './useScreenshotCursors';
import { useScreenshotLayerShortcuts } from './useScreenshotLayerShortcuts';
import { useScreenshotLayerClipboard } from './useScreenshotLayerClipboard';
import { screenshotImage, createScreenshotImage } from './screenshot-images';
import { createScreenshotImageLoader } from './screenshot-assets';
import { validScreenshotDimensions } from './screenshot-dimensions';
import {
  initializeScreenshotComposition,
  insertScreenshotLayer,
  removeScreenshotLayer,
  canRemoveScreenshotLayer,
  restoreScreenshotLayer,
  screenshotLayers,
  SCREENSHOT_BACKGROUND_ID,
  SCREENSHOT_WATERMARK_ID,
} from './screenshot-layers';

export function useScreenshotEditor(id: () => string, ready: () => void, previewFullscreen: () => boolean) {
  const { t } = useTranslate('ScreenshotEditor');
  const toast = useToastStore();
  const document = ref<ScreenshotDocument | null>(null);
  const state = ref<ScreenshotState | null>(null);
  const presets = ref<EditorPresetDocument | null>(null);
  const backgroundLibrary = ref<BackgroundMedia[]>([]);
  const selection = useScreenshotSelection(() => (state.value ? screenshotLayers(state.value) : []));
  const { selectedId, selectedIds } = selection;
  const panel = ref<ScreenshotPanel>('shapes');
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
  const loadImage = createScreenshotImageLoader();
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
  const select = (id: string | null, mode?: ScreenshotSelectionMode) => {
    selection.select(id, mode);
    id = selectedId.value;
    showSelection(id);
  };
  const selectMany = (next: CanvasMarqueeSelection) => {
    selection.selectMany(next.ids, next.primaryId);
    showSelection(selectedId.value);
  };
  const showSelection = (id: string | null) => {
    if (state.value?.effects?.some((effect) => effect.id === id)) {
      elements.finishText();
      elements.drawingMode.value = false;
    }
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
  const removeLayer = (id: string) => {
    if (!state.value || busy.value || cropping.value) return;
    const targets = selectedIds.value.includes(id) ? selectedIds.value : [id];
    const targetsToRemove = screenshotLayers(state.value).filter(
      (layer) => targets.includes(layer.id) && canRemoveScreenshotLayer(layer),
    );
    if (!targetsToRemove.length) return;
    beginPropertyInteraction();
    try {
      elements.finishText();
      for (const layer of targetsToRemove) removeScreenshotLayer(state.value, layer.id);
      selection.reconcile();
      showSelection(selectedId.value);
    } finally {
      endPropertyInteraction();
    }
  };
  const translate = (value: ScreenshotTranslation) => {
    if (state.value && !busy.value && !cropping.value)
      applyScreenshotTranslation(state.value, selectedIds.value, value);
  };
  const transform = (value: NormalizedTransform) => {
    if (selectedLayer.value?.locked) return;
    if (cursors.selected.value) cursors.transform(value);
    else if (selectedShape.value) selectedShape.value.transform = value;
    else if (effects.selected.value) effects.selected.value.transform = value;
    else if (image.value) image.value.transform = value;
  };
  const rotate = (value: number) => {
    if (selectedLayer.value?.locked) return;
    if (cursors.selected.value) cursors.update({ rotation: value });
    else if (selectedShape.value) selectedShape.value.rotation = value;
  };
  const startCrop = (targetId: string) => {
    if (!state.value || busy.value) return;
    const target = screenshotLayers(state.value).find((layer) => layer.id === targetId);
    if (target?.kind !== 'image' || target.locked) return;
    select(targetId);
    cropping.value = true;
  };
  const appearance = (value: Partial<ClipAppearance>) => {
    if (image.value) image.value.appearance = { ...image.value.appearance, ...value };
  };
  const insertImageAsset = async (asset: MediaAsset, current: number) => {
    const decoded = await loadImage(asset.src);
    if (current !== generation || !state.value) return false;
    if (!validScreenshotDimensions({ width: decoded.naturalWidth, height: decoded.naturalHeight }))
      throw new Error(t('dimensionsError'));
    const layer = createScreenshotImage(asset, decoded.naturalWidth, decoded.naturalHeight, state.value.canvas);
    initializeScreenshotComposition(state.value);
    (state.value.images ??= []).push(layer);
    insertScreenshotLayer(state.value, layer.id);
    select(layer.id);
    return true;
  };
  const importImage = async (source: (projectId: string) => Promise<MediaAsset | null>) => {
    if (!document.value || !state.value || busy.value || cropping.value) return;
    elements.finishText();
    elements.drawingMode.value = false;
    busy.value = true;
    const current = generation;
    const projectId = document.value.id;
    let importedSource: string | undefined;
    let inserted = false;
    try {
      const asset = await source(projectId);
      importedSource = asset?.src;
      if (!asset || current !== generation) return;
      inserted = await insertImageAsset(asset, current);
    } catch (reason) {
      fail(reason);
    } finally {
      if (importedSource && !inserted) await capture.discardScreenshotImage(projectId, importedSource).catch(fail);
      busy.value = false;
    }
  };
  const addImage = () => importImage((projectId) => capture.pickScreenshotImage(projectId));
  const pasteImage = () => importImage((projectId) => capture.pasteScreenshotClipboardImage(projectId));
  const removeShape = () => {
    if (!state.value || !selectedShape.value) return;
    removeScreenshotLayer(state.value, selectedShape.value.id);
    selectedId.value = state.value.shapes.at(-1)?.id ?? null;
    panel.value = 'shapes';
  };
  const effects = useScreenshotEffects(
    state,
    selectedId,
    select,
    () => !busy.value && !cropping.value && !selectedLayer.value?.locked,
  );
  const elements = provideElementEditor({
    addBlur: () => {
      elements.finishText();
      elements.drawingMode.value = false;
      effects.add('blur');
    },
    addHighlight: () => {
      elements.finishText();
      elements.drawingMode.value = false;
      effects.add();
    },
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
    canInteract: () => !busy.value && !cropping.value && !previewFullscreen() && !selectedLayer.value?.locked,
  });
  const cursors = useScreenshotCursors(state, selectedId, select, fail);
  const shortcutsDisabled = () =>
    busy.value ||
    cropping.value ||
    previewFullscreen() ||
    Boolean(elements.editing.value) ||
    elements.drawingMode.value;
  const history = useScreenshotHistory(state, {
    disabled: () => busy.value || previewFullscreen() || Boolean(elements.editing.value),
    restore: () => {
      cropping.value = false;
      const previous = selectedId.value;
      selection.reconcile();
      if (selectedId.value !== previous) showSelection(selectedId.value);
    },
  });
  const layerClipboard = useScreenshotLayerClipboard({
    state,
    selectedIds,
    selectedId,
    source: () =>
      document.value
        ? { source: document.value.source, width: document.value.width, height: document.value.height }
        : null,
    disabled: shortcutsDisabled,
    reconcileSelection: selection.reconcile,
    showSelection,
  });
  useScreenshotLayerShortcuts({
    selected: () =>
      state.value
        ? screenshotLayers(state.value).find(
            (layer) => selectedIds.value.includes(layer.id) && canRemoveScreenshotLayer(layer),
          )
        : undefined,
    disabled: shortcutsDisabled,
    remove: removeLayer,
    copy: layerClipboard.copy,
    cut: layerClipboard.cut,
    paste: layerClipboard.paste,
  });
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
      window.document.title = editorTitle(metadata.name);
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
    if (next === 'image') {
      if (state.value) restoreScreenshotLayer(state.value, state.value.image.id);
      select(state.value?.image.id ?? null);
    } else if (next === 'canvas') select(null);
    else if (next === 'shapes' || next === 'settings') {
      panel.value = next;
      cropping.value = false;
      const importedImageSelected = image.value && image.value.id !== state.value?.image.id;
      if (next === 'shapes' && !selectedShape.value && !effects.selected.value && !importedImageSelected)
        selectedId.value = state.value?.shapes.at(-1)?.id ?? null;
    }
  };
  return {
    document,
    state,
    presets,
    backgroundLibrary,
    selectedId,
    selectedIds,
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
    pasteImage,
    canPasteLayers: layerClipboard.canPaste,
    fail,
    savePreset,
    presetAction,
    select,
    selectMany,
    selectPanel,
    transform,
    rotate,
    startCrop,
    translate,
    removeLayer,
    appearance,
    removeShape,
    exportImage,
    back,
    openProject,
    renameProject,
    deleteProject,
    cursors,
    effects,
    selectedLayer,
    history,
    elements,
  };
}
