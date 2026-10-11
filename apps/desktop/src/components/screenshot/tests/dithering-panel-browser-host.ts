import '../../../style.css';
import '../../editor/layout/editor-layout-tokens.css';
import { createPinia } from 'pinia';
import { createApp, h, nextTick, ref } from 'vue';
import { i18n, initI18n, setCurrentLocale } from '../../../i18n';
import type { AppLocale } from '../../../i18n/types';
import ScreenshotPropertiesPanel from '../ScreenshotPropertiesPanel.vue';
import ScreenshotDitheringPanel from '../gradient/ScreenshotDitheringPanel.vue';
import { createDitheringEffect } from '@beam/engine';
import type { DitheringEffect } from '@beam/engine/gradient/dithering-effect-types';

let active: ReturnType<typeof createApp> | undefined;
const effect = ref(createDitheringEffect('test'));
export const currentDitheringEffect = () => JSON.parse(JSON.stringify(effect.value)) as DitheringEffect;
export async function mountDitheringPanel(locale: AppLocale, scale: number, dark = false) {
  active?.unmount();
  await initI18n();
  await setCurrentLocale(locale);
  effect.value = createDitheringEffect('test');
  effect.value.recipe.algorithm = 'jarvis-judice-ninke';
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.setProperty('--ui-scale-properties', String(scale));
  document.body.innerHTML = '<div id="test" style="position:relative;width:1200px;height:850px"></div>';
  active = createApp({
    render: () =>
      h(
        ScreenshotPropertiesPanel,
        { title: i18n.global.t('DitheringEffect.title'), open: true },
        {
          default: () =>
            h(ScreenshotDitheringPanel, {
              effect: effect.value,
              onUpdate: (patch: Partial<DitheringEffect>) => {
                effect.value = { ...effect.value, ...patch };
              },
            }),
        },
      ),
  });
  active.use(createPinia()).use(i18n).mount('#test');
  await nextTick();
  await document.fonts.ready;
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}
