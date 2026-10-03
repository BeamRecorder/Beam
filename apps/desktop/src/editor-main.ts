import { createApp } from 'vue';
import { createPinia } from 'pinia';
import './style.css';
import { capture } from './api/capture';
import EditorWindowApp from './components/editor/EditorWindowApp.vue';
import { prepareWindowAppearance } from './window-bootstrap';
import { installBrowserZoomGuard } from './utils/browserZoomGuard';

installBrowserZoomGuard();

const bootstrap = async () => {
  const app = createApp(EditorWindowApp);
  const pinia = createPinia();
  app.use(pinia);
  capture.reportEditorLoadingStage('loadingAppearance');
  app.use(await prepareWindowAppearance(pinia));
  // Keep the native window's themed backing visible until all appearance
  // tokens are hydrated, then make the editor document opaque before mounting.
  document.documentElement.classList.add('editor-window-root');
  app.mount('#app');
};

void bootstrap();
