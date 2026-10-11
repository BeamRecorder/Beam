import { nextTick } from 'vue';
import { createMotion } from './motion';
import { seekSeconds } from './scene-state';
import type { ScenePose, SceneWindow } from './scene-types';
export function registerComposition(pose: ScenePose) {
  const timeline = createMotion(pose);
  const host = window as unknown as SceneWindow;
  host.__timelines = { ...host.__timelines, 'local-render': timeline };
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
}
