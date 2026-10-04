import { createApp, nextTick, reactive } from 'vue';
import Scene from './Scene.vue';
import { createMotion, initialPose, seekSeconds } from './motion';
import type { DemoScene, DemoWindow } from './demo-types';
import './style.css';

const pose = reactive(initialPose());
const scene = createApp(Scene, { pose }).mount('#app') as unknown as DemoScene;
const tl = createMotion(pose);
const host = window as unknown as DemoWindow;
host.__timelines = { ...host.__timelines, 'editing-timeline': tl };
const ready = (async () => {
  await document.fonts.ready;
  await Promise.all(Array.from(document.images, (image) => image.decode()));
  await nextTick();
  scene.paint();
})();
host.beamComposition = {
  ready,
  timeline: tl,
  async seek(timeMs) {
    tl.seek(seekSeconds(timeMs), false);
    await nextTick();
    scene.paint();
  },
};
