import { createApp, nextTick, reactive } from 'vue';
import { createI18n } from 'vue-i18n';
import enCore from '../../../apps/desktop/src/i18n/en/core.json';
import enEditor from '../../../apps/desktop/src/i18n/en/editor.json';
import Scene from './Scene.vue';
import { clampTime, createMotion, initialPose, stateAt } from './motion';
import type { DemoKind, DemoWindow } from './demo-types';
import './style.css';
const kind = document.documentElement.dataset.demoKind as DemoKind;
const theme = document.documentElement.dataset.demoTheme!;
const pose = reactive(initialPose());
createApp(Scene, { pose, kind, theme })
  .use(createI18n({ legacy: false, locale: 'en', messages: { en: { ...enCore, ...enEditor } } }))
  .mount('#app');
const timeline = createMotion(pose, kind);
const host = window as unknown as DemoWindow;
host.__timelines = { ...host.__timelines, 'recording-final': timeline };
const settle = async () => {
  await nextTick();
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
};
const ready = (async () => {
  await settle();
  await document.fonts.ready;
  await Promise.all([...document.images].map((image) => image.decode()));
  await settle();
})();
host.beamComposition = {
  ready,
  timeline,
  async seek(ms) {
    await ready;
    timeline.seek(clampTime(ms), false);
    await nextTick();
    const state = stateAt(pose.time);
    const label = kind === 'teleprompter' ? 'Speed' : 'Project actions';
    const button = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
    const open = kind === 'teleprompter' ? state.speedOpen : state.menuOpen;
    if ((button.getAttribute('aria-expanded') === 'true') !== open) {
      button.click();
      await settle();
    }
    const reader = document.querySelector<HTMLElement>('.teleprompter-display');
    if (reader) reader.scrollTop = state.scroll;
  },
};
