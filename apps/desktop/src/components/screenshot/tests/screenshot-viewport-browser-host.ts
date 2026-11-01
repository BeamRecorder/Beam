import '../../../style.css';
import '../screenshot-editor.css';
import '../screenshot-canvas.css';
import '../../editor/layout/editor-preview-layout.css';
import { createApp, h, nextTick, ref } from 'vue';
import type { App } from 'vue';
import { i18n, setCurrentLocale } from '../../../i18n';
import type { ScreenshotDocument } from '~/api/types/screenshot';
import { DEFAULT_OUTPUT_CANVAS } from '@beam/engine/layout/output-canvas';
import ScreenshotViewControls from '../ScreenshotViewControls.vue';
import { useScreenshotViewport } from '../useScreenshotViewport';
import EditorTitlebar from '../../editor/EditorTitlebar.vue';
import EditorWorkspace from '../../editor/layout/EditorWorkspace.vue';

let app: App | undefined;

/** Real View controls and viewport measurement, with a lightweight media rectangle. */
export async function mountScreenshotViewport(width: number, height: number) {
  app?.unmount();
  await setCurrentLocale('en');
  document.body.innerHTML = '<div id="test"></div>';
  const documentFixture: ScreenshotDocument = {
    id: 'viewport',
    name: 'Screenshot',
    width,
    height,
    source: 'test.png',
    state: null,
    preset: {
      editor: { schemaVersion: 1 },
      devices: {},
      export: { format: 'png', resolution: '1080p' },
      quickSnip: { automaticZoom: false },
    },
  };
  const canvas = ref({ ...DEFAULT_OUTPUT_CANVAS, preset: 'custom' as const, width, height });
  app = createApp({
    setup() {
      const stage = ref<HTMLElement | null>(null),
        viewport = useScreenshotViewport(
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
                  document: documentFixture,
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
          h(EditorWorkspace, { kind: 'screenshot' }, () =>
            h('div', { class: 'screenshot-stage' }, [
              h('div', { ref: stage, class: 'stage-bounds', onWheel: viewport.wheel }, [
                h('div', {
                  id: 'viewport-image',
                  class: 'image-stage',
                  style: { ...viewport.stageStyle.value, background: '#ffffff' },
                }),
              ]),
            ]),
          ),
        ]);
    },
  });
  app.use(i18n);
  app.mount('#test');
  await nextTick();
}
