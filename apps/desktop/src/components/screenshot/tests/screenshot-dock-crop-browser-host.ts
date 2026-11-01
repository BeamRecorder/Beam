import '../../../style.css';
import '../screenshot-editor.css';
import '../../editor/layout/editor-preview-layout.css';
import { createApp, h, ref } from 'vue';
import type { App } from 'vue';
import { createPinia } from 'pinia';
import { i18n, setCurrentLocale } from '../../../i18n';
import { usePreferencesStore } from '../../../stores/preferences';
import type { NormalizedCrop } from '@beam/engine/shared/composition-types';
import { cropFromPixels, cropPixels } from '@beam/engine/layout/crop/crop-pixels';
import { readDockTools, SCREENSHOT_DOCK_KEY } from '../screenshot-dock-model';
import ScreenshotToolbar from '../ScreenshotToolbar.vue';
import CanvasCropSelection from '../../editor/canvas/CanvasCropSelection.vue';
import EditorTitlebar from '../../editor/EditorTitlebar.vue';
import EditorWorkspace from '../../editor/layout/EditorWorkspace.vue';
import ShapePicker from '../../editor/elements/ShapePicker.vue';
import ArrowPicker from '../../editor/elements/ArrowPicker.vue';
import { provideElementEditor } from '../../editor/elements/useElementEditor';
import { useElementAssets } from '../../editor/elements/useElementAssets';
import { elementAssetPreviewClip } from '../../editor/elements/element-asset-preview';
import { normalizeShapeLayerStyle } from '@beam/engine/shared/shape-layer-style';
import { createElementText } from '@beam/engine/shared/element-text';
import { arrowVector } from '@beam/engine/shared/shape-vector-presets';
import type { ElementAsset } from '@beam/engine/shared/element-asset-types';

let app: App | undefined;
const pan = ref({ x: 0, y: 0 });
export async function mountAssetPreviewFixture(family: 'shape' | 'arrow') {
  app?.unmount();
  const pinia = createPinia(),
    store = useElementAssets(pinia),
    canvas = { width: 1920, height: 1080 };
  const bubble: ElementAsset = {
    id: 'saved-bubble',
    name: 'Orange speech bubble',
    size: { width: 480, height: 300 },
    style: normalizeShapeLayerStyle({
      family: 'shape',
      preset: 'speech-bubble',
      fillColor: '#ee7733',
      borderWidth: 6,
      text: createElementText('Hello'),
      shadowEnabled: true,
      shadowBlur: 8,
    }),
  };
  const arrow: ElementAsset = {
    id: 'saved-arrow',
    name: 'Green curved arrow',
    size: { width: 480, height: 280 },
    style: normalizeShapeLayerStyle({
      family: 'arrow',
      preset: 'arrow',
      vector: arrowVector('curved'),
      fillEnabled: false,
      fillColor: '#22cc66',
      borderColor: '#22cc66',
      borderWidth: 6,
    }),
  };
  await store.add(bubble);
  await store.add(arrow);
  const layers = [bubble, arrow].map((asset) => elementAssetPreviewClip(asset, canvas));
  document.body.innerHTML = '<div id="test"></div>';
  app = createApp({
    setup() {
      provideElementEditor({
        layers: () => layers,
        selectedId: () => (family === 'shape' ? bubble.id : arrow.id),
        canvasSize: () => canvas,
        select: () => {},
        insert: () => {},
        update: () => {},
        remove: () => {},
        timing: () => ({ startMs: 0, durationMs: 1000 }),
      });
      return () =>
        h(
          'div',
          { style: { width: '340px', margin: '80px', padding: '16px', background: 'var(--color-bg-surface)' } },
          [family === 'shape' ? h(ShapePicker, { modelValue: 'speech-bubble' }) : h(ArrowPicker)],
        );
    },
  });
  app.use(pinia);
  app.use(i18n);
  app.mount('#test');
}
export function moveCropFixture(x: number, y: number) {
  pan.value = { x, y };
}

/** Only the native preference bridge and media rectangle are fixtures; dock and crop controls are real. */
export async function mountDockCropFixture() {
  app?.unmount();
  await setCurrentLocale('en');
  const pinia = createPinia(),
    preferences = usePreferencesStore(pinia);
  await preferences.load();
  const cropping = ref(false),
    added = ref(''),
    confirmed = ref(0),
    size = { width: 1920, height: 1080 },
    crop = ref(cropFromPixels({ left: 100, right: 200, top: 50, bottom: 100, width: 1620, height: 930 }, size));
  pan.value = { x: 0, y: 0 };
  document.body.innerHTML = '<div id="test"></div>';
  app = createApp({
    render: () =>
      h('main', { class: 'screenshot-editor' }, [
        h(EditorTitlebar, {}, { center: () => 'Dock and crop' }),
        h(EditorWorkspace, { kind: 'screenshot' }, () =>
          h('div', { class: 'screenshot-stage' }, [
            h('div', { class: 'stage-bounds', style: { background: '#43578b' } }, [
              h(
                'div',
                {
                  style: {
                    position: 'absolute',
                    left: '120px',
                    top: '70px',
                    width: '600px',
                    height: '337.5px',
                    background: '#ffffff',
                    transform: `translate3d(${pan.value.x}px, ${pan.value.y}px, 0)`,
                  },
                },
                [
                  cropping.value
                    ? h(CanvasCropSelection, {
                        containerStyle: { inset: '0' },
                        overlayStyle: {
                          left: `${crop.value.x * 100}%`,
                          top: `${crop.value.y * 100}%`,
                          width: `${crop.value.width * 100}%`,
                          height: `${crop.value.height * 100}%`,
                        },
                        measurements: cropPixels(crop.value, size),
                        onCropEdit: (next: NormalizedCrop) => {
                          crop.value = next;
                        },
                        onDone: () => {
                          cropping.value = false;
                          confirmed.value++;
                        },
                      })
                    : null,
                ],
              ),
            ]),
            h('div', { class: 'canvas-controls' }, [
              h(ScreenshotToolbar, {
                disabled: false,
                cropping: cropping.value,
                canCrop: true,
                drawing: false,
                editingText: false,
                panel: 'canvas',
                inspectorOpen: true,
                canGroup: true,
                canUngroup: true,
                canUndo: true,
                canRedo: true,
                onAdd: (kind: string) => {
                  added.value = kind;
                },
                onCrop: () => {
                  if (cropping.value) confirmed.value++;
                  cropping.value = !cropping.value;
                },
              }),
            ]),
            h('output', {
              id: 'fixture-state',
              style: { display: 'none' },
              'data-added': added.value,
              'data-left': cropPixels(crop.value, size).left,
              'data-confirmed': confirmed.value,
              'data-pins': readDockTools(preferences.settings?.extras?.[SCREENSHOT_DOCK_KEY]).join(','),
            }),
          ]),
        ),
      ]),
  });
  app.use(pinia);
  app.use(i18n);
  app.mount('#test');
}
