import { createApp, defineComponent, h, nextTick } from 'vue';
import type { App } from 'vue';
import { i18n, setCurrentLocale } from '~/i18n';
import type { DesktopCaptureApi } from '~/api/types/capture-api';
import CaptureSettingsWindow from '../hud/region/CaptureSettingsWindow.vue';
import Button from '~/ui/button/Button.vue';
import PopoverMenuList from '~/ui/popover/PopoverMenuList.vue';
import '~/style.css';

let app: App | null = null;
let measurements: number[] = [];
export const captureSettingsMeasurements = () => measurements;
export async function mountLongCaptureSettings(surface: 'settings' | 'labels') {
  app?.unmount();
  document.body.replaceChildren();
  measurements = [];
  Object.defineProperty(window, 'capture', {
    configurable: true,
    value: { platform: 'win32' } satisfies Pick<DesktopCaptureApi, 'platform'>,
  });
  const { default: CaptureQuickSettingsPanel } = await import('../hud/region/CaptureQuickSettingsPanel.vue');
  await setCurrentLocale('vi');
  const target = document.createElement('div');
  document.body.append(target);
  app = createApp(
    defineComponent({
      setup: () => () =>
        surface === 'settings'
          ? h(
              CaptureSettingsWindow,
              {
                content: { visible: true, side: 'above', anchorX: 100, device: null },
                label: 'Cài đặt ghi hình',
                onFit: (height: number) => measurements.push(height),
              },
              {
                default: () =>
                  h(CaptureQuickSettingsPanel, {
                    modelValue: {
                      cameraId: 'off',
                      microphoneId: 'no-audio',
                      systemAudio: false,
                      countdownSeconds: 3,
                      hideTaskbar: false,
                      hideDesktopIcons: false,
                      showRealCursor: true,
                      zoomMode: 'glass',
                    },
                    showPreset: true,
                    presetId: 'long',
                    presets: [{ value: 'long', label: 'Bản ghi màn hình dành cho hướng dẫn sử dụng sản phẩm' }],
                  }),
              },
            )
          : h('div', { style: { width: '160px', margin: '20px' } }, [
              h(Button, { variant: 'ghost', block: true }, { default: () => 'Cài đặt ghi hình và thiết bị âm thanh' }),
              h(PopoverMenuList, {
                items: [
                  {
                    id: 'microphone',
                    label: 'Micrô của tai nghe không dây dành cho hội nghị truyền hình',
                    checked: true,
                  },
                ],
              }),
            ]),
    }),
  );
  app.use(i18n);
  app.mount(target);
  await document.fonts.ready;
  await nextTick();
}
