import { createApp, defineComponent, h, nextTick } from 'vue';
import type { App } from 'vue';
import { createPinia } from 'pinia';
import { i18n } from '~/i18n';
import { usePreferencesStore } from '~/stores/preferences';
import type { PreferenceSettings } from '~/api/types/capture-api';
import ClipTransitionsPanel from '../ClipTransitionsPanel.vue';
import { screenClip } from '@beam/engine/capture/screen-cursor.test-support';
import '~/style.css';

const pinia = createPinia();
const preferences = usePreferencesStore(pinia);
let app: App | null = null;
const paints = new WeakMap<object, number>();
const clearRect = CanvasRenderingContext2D.prototype.clearRect;
CanvasRenderingContext2D.prototype.clearRect = function (
  this: CanvasRenderingContext2D,
  ...args: Parameters<CanvasRenderingContext2D['clearRect']>
) {
  paints.set(this.canvas, (paints.get(this.canvas) ?? 0) + 1);
  return clearRect.apply(this, args);
};
const initialPreferences = (): PreferenceSettings => ({
  schemaVersion: 3,
  theme: 'system',
  recordingBar: { visibility: 'always' },
  recordingInteractions: { enabled: true, noticeDismissed: true },
  devices: {},
  shortcuts: {},
  backgroundPresets: { colors: [], gradients: [] },
  extras: { 'editor.transitionCategory': 'basics' },
});

export async function mountTransitionGallery(theme = 'dark', reset = true, empty = false) {
  app?.unmount();
  document.body.replaceChildren();
  document.documentElement.className = `${theme} editor-window-root`;
  document.body.style.background = 'var(--color-bg-surface)';
  if (reset) preferences.settings = initialPreferences();
  preferences.update = async (patch) => {
    const current = preferences.settings!;
    preferences.settings = { ...current, extras: { ...current.extras, ...patch.extras } };
    return preferences.settings;
  };
  const root = document.createElement('main');
  root.style.cssText = 'width:360px;padding:24px;color:var(--text-primary);font-family:var(--font-sans)';
  document.body.append(root);
  app = createApp(
    defineComponent({
      setup() {
        return () =>
          h(ClipTransitionsPanel, {
            clip: screenClip('recording', {
              transitions: {
                entry: empty ? null : { preset: { kind: 'fade' }, durationMs: 500 },
                exit: null,
              },
            }),
          });
      },
    }),
  );
  app.use(pinia);
  app.use(i18n);
  app.mount(root);
  await nextTick();
}

export function galleryPreviewState(presetId: string) {
  const canvas = document.querySelector<HTMLCanvasElement>(`[data-transition-preset="${presetId}"] canvas`)!;
  const context = canvas.getContext('2d')!;
  const pixels = canvas.width && canvas.height ? context.getImageData(0, 0, canvas.width, canvas.height).data : [];
  let colorful = 0,
    visible = 0,
    lightest = 0,
    darkest = 255;
  for (let index = 0; index < pixels.length; index += 4) {
    if (!pixels[index + 3]) continue;
    const red = pixels[index]!,
      green = pixels[index + 1]!,
      blue = pixels[index + 2]!;
    if (Math.max(red, green, blue) - Math.min(red, green, blue) > 20) colorful++;
    lightest = Math.max(lightest, red);
    darkest = Math.min(darkest, red);
    visible++;
  }
  return { paints: paints.get(canvas) ?? 0, colorful, visible, contrast: lightest - darkest };
}
