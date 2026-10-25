import { createApp, defineComponent, h, nextTick, ref, shallowRef } from 'vue';
import type { App } from 'vue';
import type { Clip, MediaAsset, VisualClip } from '@beam/engine/shared/composition-types';
import { screenClip } from '@beam/engine/capture/screen-cursor.test-support';
import { createTimelineFrameQueue } from '@beam/runtime/timeline/frame-queue';
import { i18n } from '~/i18n';
import '~/style.css';
import TimelineCanvasClips from '../TimelineCanvasClips.vue';
import TimelineSurfaceCanvas from '../TimelineSurfaceCanvas.vue';
import { useTimelineSurface } from '../composables/useTimelineSurface';

let app: App | null = null;
const colors = shallowRef(['#ffffff', '#000000']);
const clips = shallowRef<VisualClip[]>([]);
function images(): MediaAsset[] {
  return colors.value.map((color, index) => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 40;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 320, 40);
    return {
      id: `asset-${index}`,
      kind: 'image',
      name: 'thumbnail',
      fileName: null,
      origin: 'project',
      durationMs: 10000,
      width: 320,
      height: 40,
      src: canvas.toDataURL(),
    };
  });
}
export async function mountContrastTimeline(theme = 'dark', scale = 1, kind: VisualClip['kind'] = 'screen') {
  app?.unmount();
  document.body.replaceChildren();
  document.documentElement.className = theme;
  colors.value = ['#ffffff', '#000000'];
  clips.value = colors.value.map((_, index) =>
    screenClip(`clip-${index}`, {
      kind,
      assetId: `asset-${index}`,
      timelineStartMs: index * 5000,
      timelineDurationMs: 4000,
      sourceDurationMs: 4000,
      name: index === 0 ? 'Screen recording' : 'A very long imported video name',
      showCursor: index === 0,
      playbackRate: index === 0 ? 1 : 1.5,
    }),
  );
  const root = document.createElement('div');
  document.body.append(root);
  app = createApp(
    defineComponent({
      setup() {
        const scroll = ref<HTMLDivElement | null>(null);
        useTimelineSurface(
          scroll,
          createTimelineFrameQueue({
            request: (callback) => requestAnimationFrame(callback),
            cancel: (id) => cancelAnimationFrame(id),
          }),
        );
        return () => {
          const assets = images();
          return h(
            'div',
            {
              ref: scroll,
              style: {
                width: '600px',
                height: '120px',
                overflow: 'auto',
                margin: '32px',
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
              },
            },
            [
              h(TimelineSurfaceCanvas),
              h(
                'div',
                {
                  class: 'contrast-track',
                  style: { position: 'relative', width: '600px', height: '40px', marginTop: '20px' },
                },
                [
                  h(TimelineCanvasClips, {
                    clips: clips.value,
                    displayedClip: (clip: Clip) => clip,
                    assetFor: (clip: Clip) =>
                      assets.find((asset) => asset.id === ('assetId' in clip ? clip.assetId : '')) ?? null,
                    durationMs: 10000,
                    width: 600,
                    viewport: { left: 0, top: 0, width: 600, height: 120 },
                    thumbnailSlots: [],
                    deferMedia: false,
                    selectedIds: new Set<string>(),
                    linkedNames: () => [],
                    trimStateFor: () => undefined,
                  }),
                ],
              ),
            ],
          );
        };
      },
    }),
  );
  app.use(i18n);
  app.mount(root);
  await nextTick();
}
export async function swapContrastThumbnails() {
  colors.value = [...colors.value].reverse();
  await nextTick();
}
export function unmountContrastTimeline() {
  app?.unmount();
  app = null;
  document.body.replaceChildren();
}
