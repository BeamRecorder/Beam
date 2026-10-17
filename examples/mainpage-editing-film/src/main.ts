import { createApp, nextTick, reactive } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import core from '../../../apps/desktop/src/i18n/en/core.json';
import editor from '../../../apps/desktop/src/i18n/en/editor.json';
import Scene from './Scene.vue';
import { DURATION, TRIM_START, TRIM_END, menuAt } from './motion';
import { snapshotAt } from './scene-model';
import type { FilmHost } from './film-types';
import './style.css';
import { settleThumbnails } from './offline-thumbnails';

const pose = reactive({ time: 0 });
const scene = createApp(Scene, { pose })
  .use(createPinia())
  .use(createI18n({ legacy: false, locale: 'en', messages: { en: { ...core, ...editor } } }))
  .mount('#app') as unknown as InstanceType<typeof Scene>;
const host = window as unknown as FilmHost;
host.filmSnapshot = snapshotAt;
const frames = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
async function menu(desired: string | null) {
  const trigger = document.querySelector<HTMLButtonElement>('.film-add button')!;
  if (!trigger) throw new Error('Native Add trigger unavailable.');
  if ((trigger.getAttribute('aria-expanded') === 'true') !== Boolean(desired)) trigger.click();
  await nextTick();
  if (!desired) return;
  const elements = [...document.querySelectorAll<HTMLButtonElement>('.menu-item')].find(
    (item) => item.textContent?.trim() === 'Elements',
  );
  if (!elements) throw new Error('Native Elements menu unavailable.');
  if (elements.getAttribute('aria-expanded') !== 'true') elements.click();
  await nextTick();
  await frames();
  for (const button of document.querySelectorAll<HTMLButtonElement>('.menu-item')) {
    const label = button.textContent?.trim();
    if (label === 'Shape') button.dataset.filmChoice = 'shape';
    if (label === 'Blur') button.dataset.filmChoice = 'blur';
  }
}
const ready = (async () => {
  await scene.ready;
  document.querySelector('.sidebar-ruler-spacer')!.classList.add('film-add');
  await Promise.all([...document.images].map((image) => image.decode()));
  await frames();
  await settleThumbnails();
  await nextTick();
  await frames();
  // Warm actual nested menu geometry so arbitrary and reverse seeks retain cursor anchors.
  await menu('shape');
  scene.primeCursor();
  await menu(null);
  await frames();
})();
host.beamComposition = {
  ready,
  async seek(timeMs) {
    await ready;
    window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1 }));
    pose.time = Math.max(0, Math.min(DURATION, timeMs / 1000));
    await nextTick();
    await menu(menuAt(pose.time));
    if (pose.time >= TRIM_START && pose.time <= TRIM_END) {
      const handle = document.querySelector<HTMLElement>('[data-timeline-clip-id="screen"] .trim-handle.end');
      const bounds = handle?.getBoundingClientRect();
      if (handle && bounds)
        handle.dispatchEvent(
          new PointerEvent('pointerdown', {
            bubbles: true,
            pointerId: 1,
            button: 0,
            clientX: bounds.x + bounds.width / 2,
            clientY: bounds.y + bounds.height / 2,
          }),
        );
    }
    await nextTick();
    await settleThumbnails();
    await frames();
    for (const button of document.querySelectorAll<HTMLButtonElement>('.blur-properties .mode-group button')) {
      const label = button.textContent?.trim().toLowerCase();
      if (label === 'blur' || label === 'pixelated') button.dataset.filmMode = label;
    }
    await scene.paint();
    for (const animation of document.getAnimations()) animation.finish();
    await nextTick();
    await scene.paintCursor();
  },
};
