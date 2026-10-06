import { createApp, nextTick, reactive } from 'vue';
import { createI18n } from 'vue-i18n';
import enCore from '../../../apps/desktop/src/i18n/en/core.json';
import enEditor from '../../../apps/desktop/src/i18n/en/editor.json';
import Scene from './Scene.vue';
import { clampTime, createMotion, phaseTime, styleAt } from './motion';
import type { DemoTheme, DemoWindow, SceneHandle } from './demo-types';
import './style.css';
const pose = reactive({ time: 0 });
const theme = document.documentElement.dataset.demoTheme as DemoTheme;
const scene = createApp(Scene, { pose, theme })
  .use(createI18n({ legacy: false, locale: 'en', messages: { en: { ...enCore, ...enEditor } } })).mount('#app') as unknown as SceneHandle;
const timeline = createMotion(pose), host = window as unknown as DemoWindow;
host.__timelines = { ...host.__timelines, 'still-zooms': timeline };
const settle = async () => {
  await nextTick();
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
};
async function disclosure(label: string, desired: boolean) {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button.accordion-trigger')]
    .find(button => button.textContent?.trim() === label);
  if (button && (button.getAttribute('aria-expanded') === 'true') !== desired) { button.click(); await settle(); }
}
const ready = (async () => {
  await settle(); await document.fonts.ready;
  await Promise.all([...document.images].map(image => image.decode()));
  await scene.ready;
})();
host.beamComposition = {
  ready, timeline,
  async seek(ms) {
    await ready;
    timeline.seek(clampTime(ms), false);
    await nextTick();
    const t = phaseTime(pose.time), style = styleAt(t);
    await disclosure('Zoom style', true);
    await disclosure('Placement', true);
    await disclosure('Magnification', style === '2d');
    await disclosure('Selection', style === 'glass' && t < 7.2);
    await disclosure('Glass appearance', style === 'glass' && t >= 7.2);
    document.querySelector<HTMLElement>('.inspector-scroll')!.scrollTop = 0;
    await settle();
    // Native selection indicators settle at the seeked UI state, not elapsed wall time.
    for (const animation of document.getAnimations()) animation.finish();
    await settle(); scene.paint();
    await settle();
  },
};
