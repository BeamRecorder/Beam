import '../../../style.css';
import '../screenshot-editor.css';
import '../screenshot-canvas.css';
import '../../editor/layout/editor-preview-layout.css';
import { createApp, h, nextTick, ref } from 'vue';
import type { App } from 'vue';
import { createPinia } from 'pinia';
import { i18n, setCurrentLocale } from '../../../i18n';
import { usePreferencesStore } from '../../../stores/preferences';
import { DEFAULT_OUTPUT_CANVAS } from '@beam/engine/layout/output-canvas';
import type { ScreenshotDocument } from '~/api/types/screenshot';
import ScreenshotPropertiesPanel from '../ScreenshotPropertiesPanel.vue';
import ScreenshotViewControls from '../ScreenshotViewControls.vue';
import { useScreenshotPropertiesDock } from '../useScreenshotPropertiesDock';
import { useScreenshotViewport } from '../useScreenshotViewport';
import EditorTitlebar from '../../editor/EditorTitlebar.vue';
import EditorWorkspace from '../../editor/layout/EditorWorkspace.vue';

let app: App | undefined;
/** Real inspector, preference persistence, View controls and viewport sizing. */
export async function mountPropertiesDock() {
  app?.unmount();
  await setCurrentLocale('en');
  const pinia = createPinia();
  await usePreferencesStore(pinia).load();
  const document: ScreenshotDocument = {
    id: 'properties-layout',
    name: 'Screenshot',
    width: 2000,
    height: 1000,
    source: 'test.png',
    state: null,
    preset: {
      editor: { schemaVersion: 1 },
      devices: {},
      export: { format: 'png', resolution: '1080p' },
      quickSnip: { automaticZoom: false },
    },
  };
  const canvas = ref({
    ...DEFAULT_OUTPUT_CANVAS,
    preset: 'custom' as const,
    width: document.width,
    height: document.height,
  });
  window.document.body.innerHTML = '<div id="properties-test"></div>';
  app = createApp({
    setup() {
      const dock = useScreenshotPropertiesDock();
      const open = ref(true),
        title = ref('Properties'),
        stage = ref<HTMLElement | null>(null);
      const viewport = useScreenshotViewport(
        stage,
        () => canvas.value,
        () => false,
      );
      return () =>
        h('main', { class: 'screenshot-editor' }, [
          h(
            EditorTitlebar,
            {},
            {
              center: () => 'Screenshot',
              right: () =>
                h(ScreenshotViewControls, {
                  document,
                  canvas: canvas.value,
                  advanced: false,
                  keepAspect: true,
                  disabled: false,
                  canFullscreen: false,
                  zoomPercent: viewport.controls.zoomPercent.value,
                  viewMode: viewport.controls.viewMode.value,
                  onView: viewport.controls.setView,
                }),
            },
          ),
          h(EditorWorkspace, { kind: 'screenshot', class: `properties-${dock.position.value}` }, () => [
            h(
              ScreenshotPropertiesPanel,
              {
                title: title.value,
                open: open.value,
                position: dock.position.value,
                dockSaving: dock.saving.value,
                'onUpdate:position': dock.setPosition,
                onClose: () => {
                  open.value = false;
                },
              },
              () => h('input', { 'aria-label': 'Width', value: '2000' }),
            ),
            h('div', { class: 'screenshot-stage' }, [
              h('div', { ref: stage, class: 'stage-bounds' }, [
                h('div', {
                  id: 'properties-image',
                  class: 'image-stage',
                  style: { ...viewport.stageStyle.value, background: '#dceaf5' },
                }),
              ]),
            ]),
          ]),
          h(
            'button',
            {
              id: 'select-element',
              style: 'position:absolute;right:16px;bottom:16px;z-index:30',
              onClick: () => {
                title.value = 'Selected shape';
                open.value = true;
              },
            },
            'Select shape',
          ),
          h('output', {
            id: 'properties-state',
            style: 'display:none',
            'data-width': canvas.value.width,
            'data-height': canvas.value.height,
          }),
        ]);
    },
  });
  app.use(pinia);
  app.use(i18n);
  app.mount('#properties-test');
  await nextTick();
}
