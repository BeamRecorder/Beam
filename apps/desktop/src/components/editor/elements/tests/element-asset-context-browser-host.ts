import '../../../../style.css';
import '../../../screenshot/screenshot-editor.css';
import { createApp, defineComponent, h, ref } from 'vue';
import { createPinia } from 'pinia';
import { i18n } from '../../../../i18n';
import { elementAssetPreviewClip } from '../element-asset-preview';
import { normalizeShapeLayerStyle } from '@beam/engine/shared/shape-layer-style';
import { createElementText } from '@beam/engine/shared/element-text';
import { provideElementEditor } from '../useElementEditor';
import ElementAssetSavePrompt from '../ElementAssetSavePrompt.vue';
import ScreenshotMarqueeSurface from '../../../screenshot/ScreenshotMarqueeSurface.vue';
import ScreenshotComposition from '../../../screenshot/composition/ScreenshotComposition.vue';
import type { ElementAsset } from '@beam/engine/shared/element-asset-types';

export function mountAssetContextFixture() {
  const canvas = { width: 1920, height: 1080 };
  const asset: ElementAsset = {
    id: 'bubble',
    name: 'My speech bubble',
    size: { width: 480, height: 300 },
    style: normalizeShapeLayerStyle({
      family: 'shape',
      preset: 'speech-bubble',
      fillColor: '#ee7733',
      text: createElementText('Hello'),
      borderWidth: 6,
    }),
  };
  const layers = ref([elementAssetPreviewClip(asset, canvas)]);
  const selected = ref<string | null>(null);
  const surface = ref<HTMLCanvasElement | null>(null);
  const Child = defineComponent({
    setup: () => () =>
      h('div', [
        h(ElementAssetSavePrompt),
        h('div', { style: { position: 'absolute', left: '400px', top: '60px', width: '400px', height: '250px' } }, [
          h('canvas', { ref: surface, width: 400, height: 250, style: { width: '400px', height: '250px' } }),
          h(
            ScreenshotMarqueeSurface,
            {
              canvas: surface.value,
              viewport: { width: 400, height: 250 },
              targets: () => [],
              selection: [],
              disabled: false,
              spacePressed: false,
              layerAt: () => layers.value[0]!.id,
            },
            () =>
              h(
                'div',
                {
                  id: 'asset-canvas-hit',
                  style: { width: '100%', height: '100%', background: 'var(--color-bg-element)' },
                },
                'Right-click this shape',
              ),
          ),
        ]),
        h(ScreenshotComposition, {
          source: '',
          previewReady: false,
          layers: layers.value.map((clip) => ({ id: clip.id, kind: clip.family, name: clip.name, visible: true })),
          selectedId: selected.value,
          selectedIds: selected.value ? [selected.value] : [],
          onSelect: (id: string) => {
            selected.value = id;
          },
        }),
      ]),
  });
  const app = createApp({
    setup() {
      provideElementEditor({
        layers: () => layers.value,
        selectedId: () => selected.value,
        canvasSize: () => canvas,
        select: (id) => {
          selected.value = id;
        },
        insert: () => {},
        update: () => {},
        remove: (id) => {
          layers.value = layers.value.filter((clip) => clip.id !== id);
        },
        timing: () => ({ startMs: 0, durationMs: 1 }),
      });
      return () => h(Child);
    },
  });
  document.body.innerHTML = '<div id="asset-context-fixture"></div>';
  app.use(createPinia());
  app.use(i18n);
  app.mount('#asset-context-fixture');
}
