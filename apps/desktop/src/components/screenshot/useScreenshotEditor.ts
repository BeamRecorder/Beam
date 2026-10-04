import { useScreenshotGroups } from './useScreenshotGroups';
import { transformScreenshotGroup } from '@beam/engine/screenshot/screenshot-groups';
import { useScreenshotLayerEffects } from './gradient/useScreenshotLayerEffects';
import { useScreenshotImageImport } from './useScreenshotImageImport';
import { useScreenshotAuthoring } from '../authoring/useScreenshotAuthoring';
import { useScreenshotPresets } from './useScreenshotPresets';
import { useScreenshotPanel } from './useScreenshotPanel';
import { provideScreenshotEditorSearch } from '../editor/search/useScreenshotEditorSearch';
import { screenshotInserter } from './screenshot-insert';
import { useScreenshotEffects } from './useScreenshotEffects';
import { useScreenshotZooms } from './useScreenshotZooms';
import { editorTitle } from '../editor/editor-window-title';
import { provideElementEditor } from '../editor/elements/useElementEditor';
import { useTranslate } from '~/i18n/useTranslate';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useScreenshotExportToast } from './export/screenshot-export-toast';
import { useScreenshotProjectThumbnail } from './export/useScreenshotProjectThumbnail';
import { useScreenshotStartup } from './loading/useScreenshotStartup';
import type { ScreenshotPanel, ScreenshotSelectionMode, ScreenshotTranslation } from './screenshot-types';
import type { CanvasMarqueeSelection } from '../editor/canvas/canvas-marquee-types';
import { useScreenshotSelection } from './useScreenshotSelection';
import { applyScreenshotTranslation } from './screenshot-selection-transform';
import type { CaptureProject } from '~/api/types/capture-api';
import { capture } from '~/api/capture';
import type { ScreenshotDocument } from '~/api/types/screenshot';
import type { ScreenshotState } from '@beam/engine/screenshot/screenshot-types';
import type { ClipAppearance, MediaAsset, NormalizedTransform } from '@beam/engine/shared/composition-types';
import type { EditorPresetDocument } from '~/api/types/editor-preset';
import { BACKGROUND_MEDIA, groupBackgroundMedia } from '../editor/composables/backgroundCatalog';
import type { BackgroundMedia } from '@beam/engine/shared/background-types';
import { screenshotState } from './screenshot-state';
import { useScreenshotExport } from './useScreenshotExport';
import { useScreenshotExport as useScreenshotEncoder } from './export/useScreenshotExport';
import {
  beginPropertyInteraction,
  endPropertyInteraction,
  propertyInteractionActive,
} from '~/composables/property-interaction';
import { useScreenshotHistory } from './useScreenshotHistory';
import { useScreenshotCursors } from './useScreenshotCursors';
import { useScreenshotLayerShortcuts } from './useScreenshotLayerShortcuts';
import { useScreenshotLayerClipboard } from './useScreenshotLayerClipboard';
import { createScreenshotImage, screenshotImageProperties } from './screenshot-images';
import { screenshotImage } from '@beam/engine/screenshot/screenshot-images';
import { loadEditorImage } from '../editor/resources/editor-image-cache';
import { useEditorResources } from '../editor/resources/useEditorResources';
import { useScreenshotBackgroundLibrary } from './useScreenshotBackgroundLibrary';
import { validScreenshotDimensions } from '@beam/engine/screenshot/screenshot-dimensions';
import {
  initializeScreenshotComposition,
  insertScreenshotLayer,
  removeScreenshotLayer,
  canRemoveScreenshotLayer,
  screenshotLayers,
} from '@beam/engine/screenshot/screenshot-layers';

export function useScreenshotEditor(
  id: () => string,
  ready: () => void,
  previewFullscreen: () => boolean,
  previewReady: () => boolean = () => true,
) {
  const { t } = useTranslate('ScreenshotEditor');
  const { t: elementsText } = useTranslate('Elements');
  const { t: zoomText } = useTranslate('SidebarPanel');
  const notifyExport = useScreenshotExportToast();
  const resources = useEditorResources();
  const startup = useScreenshotStartup(resources);
  const encodeScreenshot = useScreenshotEncoder();
  const document = ref<ScreenshotDocument | null>(null);
  const state = ref<ScreenshotState | null>(null);
  const presets = ref<EditorPresetDocument | null>(null);
  const backgroundLibrary = ref<BackgroundMedia[]>([]);
  const selection = useScreenshotSelection(() => (state.value ? screenshotLayers(state.value) : []));
  const { selectedId, selectedIds } = selection;
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
  const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  const fail = (reason: unknown) => {
    error.value = reason instanceof Error ? reason.message : String(reason);
  };
  const backgrounds = computed(() =>
    groupBackgroundMedia([...BACKGROUND_MEDIA, ...backgroundLibrary.value].filter((item) => item.kind === 'image')),
  );
  const presetEditor = useScreenshotPresets({ document, state, presets, backgroundLibrary, busy, t, fail }, resources);
  const { activePreset, dirty, savePreset, presetAction } = presetEditor;
  useScreenshotBackgroundLibrary(resources, backgroundLibrary, fail);
  const selectedShape = computed(() => state.value?.shapes.find((shape) => shape.id === selectedId.value));
  const selectedLayer = computed(() =>
    state.value ? screenshotLayers(state.value).find((layer) => layer.id === selectedId.value) : undefined,
  );
  const image = computed(() => (state.value ? screenshotImage(state.value, selectedId.value) : undefined));
  const selectedImage = computed(() => screenshotImageProperties(image.value));
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
  const select = (id: string | null, mode?: ScreenshotSelectionMode) => {
    selection.select(id, mode);
    id = selectedId.value;
    showSelection(id);
  };
  const selectMany = (next: CanvasMarqueeSelection) => {
    selection.selectMany(next.ids, next.primaryId);
    showSelection(selectedId.value);
  };
  const { showSelection, selectPanel } = useScreenshotPanel({
    state,
    panel,
    cropping,
    selectedId,
    select,
    finishDrawing: () => {
      elements.finishText();
      elements.drawingMode.value = false;
    },
  });
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
    else if (image.value) image.value.rotation = value;
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
    const decoded = await loadEditorImage(asset.src);
    if (current !== generation || !state.value) return false;
    if (
      !validScreenshotDimensions({
        width: decoded.naturalWidth,
        height: decoded.naturalHeight,
      })
    )
      throw new Error(t('dimensionsError'));
    const layer = createScreenshotImage(asset, decoded.naturalWidth, decoded.naturalHeight, state.value.canvas);
    initializeScreenshotComposition(state.value);
    (state.value.images ??= []).push(layer);
    insertScreenshotLayer(state.value, layer.id);
    select(layer.id);
    return true;
  };
  const importImage = useScreenshotImageImport({
    projectId: () => document.value?.id ?? null,
    canImport: () => Boolean(state.value && !busy.value && !cropping.value),
    busy,
    generation: () => generation,
    beforeImport: () => {
      elements.finishText();
      elements.drawingMode.value = false;
    },
    insert: insertImageAsset,
    fail,
  });
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
    select: (id) => select(id, 'individual'),
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
  const cursors = useScreenshotCursors(state, selectedId, select, fail, resources);
  const zooms = useScreenshotZooms(
    state,
    selectedId,
    select,
    () => !busy.value && !cropping.value && !previewFullscreen(),
  );
  const addElement = screenshotInserter({
    canInsert: () => Boolean(state.value && !busy.value && !cropping.value && !previewFullscreen()),
    selectClip: () => selectPanel('clip'),
    shape: elements.add,
    image: addImage,
    cursor: () => cursors.add(elementsText('cursor')),
    zoom: () => {
      elements.finishText();
      elements.drawingMode.value = false;
      zooms.add(zoomText('zoom'));
    },
    effect: (kind) => {
      elements.finishText();
      elements.drawingMode.value = false;
      effects.add(kind);
    },
  });
  provideScreenshotEditorSearch({
    state,
    document,
    selectedId,
    select,
    insert: addElement,
    packs: () => cursors.packs.value,
    canInsert: () => Boolean(state.value && !busy.value && !cropping.value && !previewFullscreen()),
  });
  const shortcutsDisabled = () =>
    busy.value ||
    cropping.value ||
    previewFullscreen() ||
    Boolean(elements.editing.value) ||
    elements.drawingMode.value;
  const groups = useScreenshotGroups(state, selectedIds, shortcutsDisabled);
  const resizeSelection = (from: NormalizedTransform, to: NormalizedTransform) => {
    if (state.value && !shortcutsDisabled())
      state.value = transformScreenshotGroup(state.value, selectedIds.value, from, to);
  };
  const layerEffects = useScreenshotLayerEffects({
    state,
    selectedId,
    select,
    disabled: shortcutsDisabled,
    inspect: () => {
      panel.value = 'layer-effect';
    },
  });
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
        ? {
            source: document.value.source,
            width: document.value.width,
            height: document.value.height,
          }
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
    group: groups.group,
    ungroup: groups.ungroup,
    copy: layerClipboard.copy,
    cut: layerClipboard.cut,
    paste: layerClipboard.paste,
  });
  watch(panel, (next) => {
    if (next !== 'shapes') elements.drawingMode.value = false;
  });
  const exportImage = useScreenshotExport({
    document,
    state,
    busy,
    error,
    copied,
    finishText: elements.finishText,
    save,
    fail,
    encode: encodeScreenshot,
    notify: notifyExport,
  });
  const thumbnail = useScreenshotProjectThumbnail({
    document,
    state,
    save,
    blocked: () => !previewReady() || busy.value || propertyInteractionActive.value || Boolean(elements.editing.value),
  });
  const leave = async (navigate: () => unknown | Promise<unknown>) => {
    if (busy.value) return;
    elements.finishText();
    busy.value = true;
    try {
      await save();
      await thumbnail.flush();
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
      if (!state.value || presetEditor.isApplyingPreset()) return;
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
      const [next, library, presetDocument] = await startup.load(id());
      if (current !== generation) return;
      // Persisted state and history move into their respective owners below.
      // Keep only metadata here, rather than retaining a second edit history.
      const { state: _state, history: savedHistory, ...metadata } = next;
      document.value = { ...metadata, state: null };
      window.document.title = editorTitle(metadata.name);
      backgroundLibrary.value = library;
      presets.value = presetDocument;
      const initial = startup.time('state', () => {
        const initial = screenshotState(next, library);
        initializeScreenshotComposition(initial);
        return initial;
      });
      state.value = initial;
      startup.time('history', () => history.initialize(initial, savedHistory, 'transfer'));
      presetEditor.initializeBaseline();
    } catch (reason) {
      if (current === generation) {
        startup.fail(reason);
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

  useScreenshotAuthoring({ document, state, history, disabled: shortcutsDisabled, save });
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
    addElement,
    pasteImage,
    canPasteLayers: layerClipboard.canPaste,
    fail,
    savePreset,
    presetAction,
    select,
    selectMany,
    groups,
    resizeSelection,
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
    layerEffects,
    zooms,
    selectedLayer,
    history,
    elements,
  };
}
