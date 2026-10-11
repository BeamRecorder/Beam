import '../../../style.css';
import { createPinia } from 'pinia';
import { createApp, h, nextTick } from 'vue';
import { i18n } from '../../../i18n';
import ScreenshotPropertiesPanel from '../ScreenshotPropertiesPanel.vue';
import ScreenshotArtisticPanel from '../gradient/ScreenshotArtisticPanel.vue';
import ScreenshotComposition from '../composition/ScreenshotComposition.vue';
import { screenshotLayers } from '@beam/engine/screenshot/screenshot-layers';
import { createColorEffect, createStillDocument, createArtisticEffect } from '@beam/engine';
let active: ReturnType<typeof createApp> | undefined;
export async function mountScrollPanels(scale: number, tall: boolean) {
  active?.unmount();
  document.body.innerHTML = '<div id="test" style="position:relative;width:1000px;height:700px"></div>';
  document.documentElement.style.setProperty('--ui-scale-properties', String(scale));
  const state = createStillDocument('test', 'source.png', 100, 100).state;
  state.composition!.find((layer) => layer.id === 'image')!.effects = [createColorEffect('color')];
  const layers = screenshotLayers(state);
  active = createApp({
    render: () =>
      h('div', [
        h(
          ScreenshotPropertiesPanel,
          { title: 'Effect', open: true },
          {
            default: () =>
              tall
                ? h('div', { style: 'height:1800px' }, 'Content')
                : h(ScreenshotArtisticPanel, { effect: createArtisticEffect('grain', 'grain') }),
          },
        ),
        h('div', { style: 'position:absolute;left:400px;width:500px;height:600px' }, [
          h(ScreenshotComposition, {
            layers,
            state,
            selectedId: 'image',
            selectedIds: ['image'],
            source: 'source.png',
            previewReady: false,
            disabled: false,
          }),
        ]),
      ]),
  });
  active.use(createPinia());
  active.use(i18n);
  active.mount('#test');
  await nextTick();
  await document.fonts.ready;
  if (!document.querySelector('.layer-list')) {
    document.querySelector<HTMLButtonElement>('.composition-header button')?.click();
    await nextTick();
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}
