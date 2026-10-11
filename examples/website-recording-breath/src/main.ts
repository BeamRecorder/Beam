import { createApp, nextTick, reactive } from 'vue';
import { createI18n } from 'vue-i18n';
import enCore from '../../../apps/desktop/src/i18n/en/core.json';
import Scene from './Scene.vue';
import { clampTime, createMotion, initialPose } from './motion';
import type { BreathWindow } from './breath-types';
import './style.css';

const sources = Object.entries(
  import.meta.glob('../.beam/frames/*.webp', { eager: true, query: '?inline', import: 'default' }),
)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, url]) => url as string);
if (sources.length !== 240) throw new Error('Build the complete 240-frame supplied footage cache first.');
const frames = reactive([...sources]);
const pose = reactive(initialPose());
createApp(Scene, { pose, frames })
  .use(createI18n({ legacy: false, locale: 'en', messages: { en: enCore } }))
  .mount('#app');
const timeline = createMotion(pose);
const host = window as unknown as BreathWindow;
host.__timelines = { ...host.__timelines, 'recording-breath': timeline };
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
    const time = clampTime(timeMs);
    timeline.seek(time, false);
    await nextTick();
    // Beam owns this clock. The preview footage continues during the capture
    // pause so the viewer can see the person breathe while the timer holds.
    await Promise.all([...document.images].map((image) => image.decode()));
  },
};
