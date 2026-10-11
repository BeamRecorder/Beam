import { createApp, nextTick, reactive } from 'vue';
import Scene from './Scene.vue';
import { createMotion } from './motion';
import { seekSeconds } from './scene-state';
import type { SceneWindow } from './scene-types';
import './style.css';
const pose = reactive({ clock: 0 });
createApp(Scene, { pose }).mount('#app');
const timeline = createMotion(pose);
const host = window as unknown as SceneWindow;
host.__timelines = { ...host.__timelines, 'agent-cli': timeline };
const ready = (async () => {
  await document.fonts.ready;
  await Promise.all(Array.from(document.images, (image) => image.decode()));
  await nextTick();
})();
host.beamComposition = {
  ready,
  timeline,
  async seek(timeMs) {
    timeline.seek(seekSeconds(timeMs), false);
    await nextTick();
  },
};
