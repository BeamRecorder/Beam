import '../../../../style.css';
import '../../screenshot-editor.css';
import { createApp, defineComponent, h } from 'vue';
import { createPinia } from 'pinia';
import { i18n, setCurrentLocale } from '../../../../i18n';
import { usePreferencesStore } from '../../../../stores/preferences';
import { provideCompositionPanelDock } from '../composition-panel-dock';
import Composition from '../ScreenshotComposition.vue';
import Dock from '../ScreenshotCompositionDock.vue';
import Titlebar from '../../../editor/EditorTitlebar.vue';
import Workspace from '../../../editor/layout/EditorWorkspace.vue';
import Properties from '../../ScreenshotPropertiesPanel.vue';
import { createStillDocument } from '@beam/engine/screenshot/still-document';
import { screenshotShape } from '../../screenshot-state';
import { screenshotLayers, initializeScreenshotComposition } from '@beam/engine/screenshot/screenshot-layers';

export async function mountCompositionDock() {
  await setCurrentLocale('en');
  const pinia = createPinia();
  await usePreferencesStore(pinia).load();
  document.body.innerHTML = '<div id="test"></div>';
  const state = createStillDocument('dock-test', 'image.png', 1920, 1080).state;
  state.image.enabled = false;
  state.shapes = Array.from({ length: 4 }, (_, i) => screenshotShape('rectangle', `shape-${i}`));
  state.composition = undefined;
  initializeScreenshotComposition(state);
  const app = createApp(
    defineComponent({
      setup() {
        const dock = provideCompositionPanelDock();
        return () =>
          h('main', { class: 'screenshot-editor' }, [
            h(
              Titlebar,
              {
                class: [
                  'screenshot-topbar',
                  { 'is-dismissible': dock.expanded.value, 'composition-drop-active': dock.dragging.value },
                ],
              },
              {
                center: () =>
                  h('div', { class: 'screenshot-project-heading' }, [
                    h(Dock),
                    h('button', { class: 'test-project-name' }, 'Demo project'),
                  ]),
              },
            ),
            h(Workspace, { kind: 'screenshot' }, () => [
              h(Properties, { title: 'Properties', open: true }, () => h('input', { placeholder: 'Inspector field' })),
              h('div', { class: 'screenshot-preview-stage' }),
            ]),
            h('div', { class: 'composition-panel-overlay' }, [
              h(Composition, {
                state,
                source: '',
                previewReady: false,
                layers: screenshotLayers(state),
                selectedId: null,
                selectedIds: [],
              }),
            ]),
          ]);
      },
    }),
  );
  app.use(pinia);
  app.use(i18n);
  app.mount('#test');
  return { dispose: () => app.unmount() };
}
