import { createApp, nextTick, reactive } from 'vue';
import { createI18n } from 'vue-i18n';
import enCore from '../../../apps/desktop/src/i18n/en/core.json';
import enEditor from '../../../apps/desktop/src/i18n/en/editor.json';
import Scene from './Scene.vue';
import { clampTime, createMotion, initialPose, stateAt } from './motion';
import type { DemoKind, DemoTheme, DemoWindow, SceneHandle } from './demo-types';
import './style.css';
const kind = document.documentElement.dataset.demoKind as DemoKind;
const theme = document.documentElement.dataset.demoTheme as DemoTheme;
const pose = reactive(initialPose());
const scene = createApp(Scene, { pose, kind, theme })
  .use(createI18n({ legacy: false, locale: 'en', messages: { en: { ...enCore, ...enEditor } } })).mount('#app') as unknown as SceneHandle;
const timeline = createMotion(pose, kind), host = window as unknown as DemoWindow;
host.__timelines = { ...host.__timelines, 'glass-loops': timeline };
const settle = async () => {
  await nextTick();
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
};
async function disclosure(label: string, desired: boolean) {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button.accordion-trigger')]
    .find(button => button.textContent?.trim() === label);
  if (button && (button.getAttribute('aria-expanded') === 'true') !== desired) { button.click(); await settle(); }
}
function clickLabel(label: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === label);
  if (!button) throw new Error(`Native control unavailable: ${label}`);
  button.click();
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
    const state = stateAt(pose.time, kind);
    if (kind === 'automatic' && !document.querySelector('.glass-controls')) clickLabel(pose.time < .65 || pose.time >= 9.5 ? '2D' : 'Loupe');
    await settle();
    const states: [string, boolean][] = [['Zoom style', state.style], ['Selection', state.selection],
      ['Glass appearance', state.appearance], ['Magnification', state.magnification],
      ['Automatic generation', state.automatic], ['Animation', false], ['Camera follow', false], ['Motion blur', false]];
    for (const desired of [false, true]) for (const [label, value] of states)
      if (value === desired) await disclosure(label, value);
    const dialog = document.querySelector('[role="dialog"]');
    if (Boolean(dialog) !== state.dialog) {
      clickLabel(state.dialog ? 'Generate Auto Zooms' : pose.time >= 3.35 ? 'Regenerate' : 'Cancel');
      await settle();
    }
    document.querySelector<HTMLElement>('.inspector-scroll')!.scrollTop = 0;
    await settle(); scene.paint();
  },
};
