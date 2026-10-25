import { createApp, defineComponent, h } from 'vue';
import type { App } from 'vue';
import { i18n, setCurrentLocale } from '~/i18n';
import '~/style.css';
import QuickSnipSelectionBar from './QuickSnipSelectionBar.vue';
import type { QuickSnipSelectionState } from './quick-snip-selection-types';
let app: App | null = null;
export async function mountVietnameseCaptureBar(displayMode: 'studio' | 'screenshot' = 'studio') {
  app?.unmount();
  document.body.replaceChildren();
  await setCurrentLocale('vi');
  const target = document.createElement('div');
  document.body.append(target);
  const state: QuickSnipSelectionState = {
    displayMode,
    mode: displayMode,
    captureTarget: 'screen',
    settingsDisabled: false,
    microphone: false,
    microphoneLevel: 0,
    systemAudio: false,
    systemAudioLevel: 0,
    camera: false,
    settingsOpen: false,
    captureHint: 'Start',
    preparing: false,
    actionPending: false,
    configured: true,
    deviceMenuBusy: false,
  };
  app = createApp(
    defineComponent({
      setup: () => () =>
        h('main', { style: { position: 'relative', width: '616px', height: '76px' } }, [
          h(QuickSnipSelectionBar, { state, embedded: true }),
        ]),
    }),
  );
  app.use(i18n);
  app.mount(target);
  await document.fonts.ready;
}
