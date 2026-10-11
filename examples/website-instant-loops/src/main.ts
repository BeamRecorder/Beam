import { createApp, reactive, nextTick } from 'vue';
import { gsap } from 'gsap';
import { createI18n } from 'vue-i18n';
import core from '../../../apps/desktop/src/i18n/en/core.json';
import editor from '../../../apps/desktop/src/i18n/en/editor.json';
import Scene from './Scene.vue';
import ClipboardScene from './ClipboardScene.vue';
import HeroScene from './HeroScene.vue';
import { seekSeconds } from './motion';
import { HERO_DURATION, heroSeconds } from './hero-motion';
import type { DemoMode, DemoWindow, SceneController } from './demo-types';
import './style.css';
const pose = reactive({ time: 0 });
const mode = (document.documentElement.dataset.demoMode ||
  window.parent.document.documentElement.dataset.demoMode) as DemoMode;
if (window.parent !== window && window.parent.document.documentElement.classList.contains('dark'))
  document.documentElement.classList.add('dark');
const duration = mode === 'hero' ? HERO_DURATION : 8;
document.getElementById('native-root')!.dataset.duration = String(duration);
document.getElementById('app')!.dataset.duration = String(duration);
const seconds = mode === 'hero' ? heroSeconds : seekSeconds;
const app = createApp(mode === 'hero' ? HeroScene : mode === 'clipboard' ? ClipboardScene : Scene, { mode, pose });
app.use(createI18n({ legacy: false, locale: 'en', messages: { en: { ...editor, ...core } } }));
const scene = app.mount('#app') as unknown as SceneController;
const ready = (async () => {
  await document.fonts.load('14px "Hanken Grotesk"');
  await document.fonts.ready;
  await scene.ready;
  await Promise.all([...document.images].map((image) => image.decode()));
})();
const host = window as unknown as DemoWindow;
const timeline = gsap.timeline({ paused: true }).to(pose, {
  time: duration,
  duration,
  ease: 'none',
  onUpdate: () => {
    void scene.synchronize();
  },
});
const api = {
  ready,
  async seek(timeMs: number) {
    await ready;
    timeline.seek(seconds(timeMs), true);
    await nextTick();
    await scene.synchronize();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  },
};
host.beamNative = api;
host.beamComposition = { ...api, timeline };
host.__timelines = { ...host.__timelines, 'instant-native': timeline };
