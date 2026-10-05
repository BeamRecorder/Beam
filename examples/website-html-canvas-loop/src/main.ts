import { createApp, h, nextTick, reactive } from 'vue';
import Scene from './Scene.vue';
import Artwork from './Artwork.vue';
import { sceneState } from './scene-state';
import { createI18n } from 'vue-i18n';
import enCore from '../../../apps/desktop/src/i18n/en/core.json';
import enEditor from '../../../apps/desktop/src/i18n/en/editor.json';
import { createMotion } from './motion';
import { seekSeconds } from './scene-state';
import type { SceneWindow, SceneInstance } from './scene-types';
import './style.css';

const pose = reactive({ clock: 0 });
// Capture the same authored geometry at 2× for crisp native Beam camera zooms.
document.documentElement.style.setProperty('--capture-scale', String(window.innerWidth / 1280));
const artifact = new URLSearchParams(location.search).has('artifact');
const app = artifact
  ? createApp({
      setup: () => () => [
        h(Artwork, { state: sceneState(pose.clock) }),
        h('div', { class: 'save-button', hidden: true }),
      ],
    })
  : createApp(Scene, { pose });
app.use(createI18n({ legacy: false, locale: 'en', messages: { en: { ...enCore, ...enEditor } } }));
const scene = app.mount('#app');
const timeline = createMotion(pose);
const host = window as unknown as SceneWindow;
host.__timelines = { ...host.__timelines, 'html-canvas': timeline };
const ready = (async () => {
  await document.fonts.ready;
  await Promise.all(Array.from(document.images, (image) => image.decode()));
  await nextTick();
  if (!artifact) await (scene as unknown as SceneInstance).ready();
  // The native inspector is a scroll viewport. Its controls below the fold
  // stay mounted; declare that clipping for the film's DOM layout audit.
  const inspector = document.querySelector('.native-inspector');
  if (inspector) {
    const bottom = inspector.getBoundingClientRect().bottom;
    for (const element of inspector.querySelectorAll('*')) {
      if (element.getBoundingClientRect().top >= bottom) element.setAttribute('data-layout-allow-occlusion', 'true');
    }
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
})();
host.beamComposition = {
  ready,
  timeline,
  async seek(timeMs) {
    timeline.seek(seekSeconds(timeMs), false);
    await nextTick();
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  },
};
