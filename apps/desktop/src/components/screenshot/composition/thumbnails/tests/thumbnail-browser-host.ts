import '../../../../../style.css';
import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { i18n } from '../../../../../i18n';
import Composition from '../../ScreenshotComposition.vue';
import { createStillDocument } from '@beam/engine/screenshot/still-document';
import { screenshotShape } from '../../../screenshot-state';
import { screenshotLayers, initializeScreenshotComposition } from '@beam/engine/screenshot/screenshot-layers';
export function mountThumbnails() {
  document.body.innerHTML = '<div id="test" style="position:relative;width:1500px;height:850px"></div>';
  const state = createStillDocument('stress', 'image.png', 1920, 1080).state;
  state.image.enabled = false;
  state.shapes = Array.from({ length: 500 }, (_, i) => screenshotShape('rectangle', `shape-${i}`));
  state.composition = undefined;
  initializeScreenshotComposition(state);
  const app = createApp({
    render: () =>
      h(Composition, { state, source: '', layers: screenshotLayers(state), selectedId: null, selectedIds: [] }),
  });
  app.use(createPinia());
  app.use(i18n);
  app.mount('#test');
  return { dispose: () => app.unmount() };
}
