import { createApp, nextTick, reactive } from 'vue';
import { createI18n } from 'vue-i18n';
import enEditor from '../../../apps/desktop/src/i18n/en/editor.json';
import enCore from '../../../apps/desktop/src/i18n/en/core.json';
import Scene from './Scene.vue';
import { clampTime, createMotion, initialPose } from './motion';
import type { CanvasScene, CanvasWindow } from './demo-types';
import './style.css';

const pose = reactive(initialPose());
const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: { en: { ...enCore, ...enEditor } },
});
const scene = createApp(Scene, { pose }).use(i18n).mount('#app') as unknown as CanvasScene;
const timeline = createMotion(pose);
const host = window as unknown as CanvasWindow;
let controlled = false;
let initialized = false;
timeline.eventCallback('onUpdate', () => {
  if (initialized && !controlled) void nextTick().then(() => scene.paint());
});
host.__timelines = { ...host.__timelines, 'editing-canvas': timeline };
const ready = (async () => {
  await scene.ready;
  await document.fonts.ready;
  await nextTick();
  await scene.paint();
  initialized = true;
})();
host.beamComposition = {
  ready,
  timeline,
  async seek(timeMs) {
    await ready;
    controlled = true;
    try {
      timeline.seek(clampTime(timeMs), false);
      await nextTick();
      await scene.paint();
    } finally {
      controlled = false;
    }
  },
};
