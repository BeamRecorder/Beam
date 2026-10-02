// Browser-only fixture keeps framework imports on the same Vite module graph as the component.
import '../../../../style.css';
import { createApp, h, markRaw, reactive, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { i18n } from '../../../../i18n';
import Timeline from '../TimelineTracks.vue';
import type { ClipComposition } from '@beam/engine';

let active: ReturnType<typeof createApp> | undefined;
export function unmountTimeline() {
  active?.unmount();
  active = undefined;
}

export async function mountTimeline(composition: ClipComposition, duration: number, zoomLevel: number) {
  unmountTimeline();
  document.body.innerHTML = '<div id="test" style="width:1000px;height:300px"></div>';
  const state = reactive({
    currentTime: 0,
    duration,
    zoomLevel,
    isPlaying: false,
    zoomElements: [],
    selectedZoomId: null,
    selectedClipId: null,
    composition: markRaw(composition),
  });
  const app = createApp({ render: () => h(Timeline, state) });
  active = app;
  app.use(createPinia());
  app.use(i18n);
  app.mount('#test');
  const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  const settle = async () => {
    await nextTick();
    await frame();
    await frame();
  };
  await settle();
  const scroll = document.querySelector<HTMLDivElement>('.timeline-tracks-container')!;
  const canvas = document.querySelector<HTMLCanvasElement>('.timeline-content-surface')!;
  const painted = () =>
    canvas
      .getContext('2d')!
      .getImageData(0, 0, canvas.width, canvas.height)
      .data.some((value, index) => index % 4 === 3 && value > 0);
  return { dispose: unmountTimeline, state, scroll, canvas, frame, settle, painted, nextTick };
}
