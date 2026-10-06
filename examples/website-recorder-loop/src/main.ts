import { createApp, nextTick, reactive } from 'vue';
import { createI18n } from 'vue-i18n';
import enCore from '../../../apps/desktop/src/i18n/en/core.json';
import Scene from './Scene.vue';
import { clampTime, createMotion, initialPose } from './motion';
import type { RecorderWindow } from './demo-types';
import './style.css';

const pose = reactive(initialPose());
createApp(Scene, { pose })
  .use(createI18n({ legacy: false, locale: 'en', messages: { en: enCore } }))
  .mount('#app');
// Native stacked labels use compact line boxes; their glyphs stay inside each
// 34px button. The thumbnail dots intentionally overlay their wallpaper image.
for (const element of document.querySelectorAll(
  '.capture-modes .btn-content, .capture-modes .btn-content-label, .window-dots',
)) {
  element.setAttribute('data-layout-allow-overflow', 'true');
}
document.querySelector('.window-dots')?.setAttribute('data-layout-allow-occlusion', 'true');
const timeline = createMotion(pose);
const host = window as unknown as RecorderWindow;
host.__timelines = { ...host.__timelines, 'recording-sources': timeline };
const ready = (async () => {
  await nextTick();
  await document.fonts.ready;
  await Promise.all([...document.images].map((image) => image.decode()));
})();
host.beamComposition = {
  ready,
  timeline,
  async seek(timeMs) {
    await ready;
    timeline.seek(clampTime(timeMs), false);
    await nextTick();
  },
};
