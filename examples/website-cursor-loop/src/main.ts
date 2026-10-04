import { createApp, nextTick, reactive } from 'vue';
import { createI18n } from 'vue-i18n';
import enEditor from '../../../apps/desktop/src/i18n/en/editor.json';
import enCore from '../../../apps/desktop/src/i18n/en/core.json';
import Scene from './Scene.vue';
import { clampTime, createMotion, initialPose } from './motion';
import type { CursorScene, CursorWindow } from './demo-types';
import './style.css';
const pose = reactive(initialPose());
const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en: { ...enCore, ...enEditor } },
});
const scene = createApp(Scene, { pose }).use(i18n).mount('#app') as unknown as CursorScene;
const timeline = createMotion(pose);
const host = window as unknown as CursorWindow;
host.__timelines = { ...host.__timelines, 'editing-cursor': timeline };
host.beamComposition = {
  ready: scene.ready,
  timeline,
  async seek(timeMs) {
    await scene.ready;
    timeline.seek(clampTime(timeMs), false);
    await nextTick();
    // Galleries are static and decoded once by scene.ready. Only moving sprites
    // and role spotlights can change their source during a seek.
    await Promise.all(
      Array.from(document.querySelectorAll<HTMLImageElement>('.demo-cursor, .spotlight-art img'), (image) =>
        image.decode(),
      ),
    );
  },
};
