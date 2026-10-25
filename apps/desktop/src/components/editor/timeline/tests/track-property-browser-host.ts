import { createApp, defineComponent, h, nextTick, provide, ref, shallowRef } from 'vue';
import type { App } from 'vue';
import type { Clip } from '@beam/engine/shared/composition-types';
import Button from '~/ui/button/Button.vue';
import { screenClip } from '@beam/engine/capture/screen-cursor.test-support';
import { createComposition } from '@beam/engine/commands/clip-engine';
import { createTimelineFrameQueue } from '@beam/runtime/timeline/frame-queue';
import { i18n } from '~/i18n';
import '~/style.css';
import { useSelectedClips } from '../../composables/useSelectedClips';
import { clipTrackPropertyScopeKey } from '../../properties/clip/clip-track-property-context';
import ClipTrackPropertyToggle from '../../properties/clip/ClipTrackPropertyToggle.vue';
import TimelineCanvasClips from '../TimelineCanvasClips.vue';
import TimelineSurfaceCanvas from '../TimelineSurfaceCanvas.vue';
import { useTimelineSurface } from '../composables/useTimelineSurface';

let app: App | null = null;
export async function mountTrackPropertyTimeline(theme = 'dark') {
  app?.unmount();
  document.body.replaceChildren();
  document.documentElement.className = `${theme} editor-window-root`;
  document.body.style.background = 'var(--color-bg-surface)';
  const picture = document.createElement('canvas');
  picture.width = 320;
  picture.height = 180;
  const context = picture.getContext('2d')!;
  context.fillStyle = theme === 'dark' ? '#f4f1eb' : '#363c49';
  context.fillRect(0, 0, 320, 180);
  for (let index = 0; index < 8; index++) {
    context.fillStyle = ['#5d7996', '#aab6c3', '#d8be8c'][index % 3]!;
    context.fillRect(16 + index * 36, 35, 22, 100);
  }
  const composition = shallowRef(
    createComposition(
      [
        {
          id: 'picture',
          kind: 'image',
          name: 'Image',
          fileName: null,
          durationMs: 2000,
          width: 320,
          height: 180,
          src: picture.toDataURL(),
          origin: 'project',
        },
      ],
      [
        ...['first', 'second', 'third', 'locked'].map((id, index) =>
          screenClip(id, {
            kind: 'image',
            assetId: 'picture',
            trackId: 'images',
            timelineStartMs: index * 2500,
            name: index === 3 ? 'Locked clip' : `Segment ${index + 1}`,
            locked: index === 3,
          }),
        ),
        screenClip('other', {
          kind: 'image',
          assetId: 'picture',
          trackId: 'another-track',
          order: 1,
          name: 'Another track',
        }),
      ],
    ),
  );
  const root = document.createElement('div');
  document.body.append(root);
  app = createApp(
    defineComponent({
      setup() {
        const state = useSelectedClips({ composition, activeTab: ref('clip') });
        state.selectClip('first');
        provide(clipTrackPropertyScopeKey, state.clipTrackProperties);
        const scroll = ref<HTMLDivElement | null>(null);
        useTimelineSurface(
          scroll,
          createTimelineFrameQueue({
            request: (callback) => requestAnimationFrame(callback),
            cancel: (id) => cancelAnimationFrame(id),
          }),
        );
        return () =>
          h('main', { style: { padding: '32px', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' } }, [
            h('div', { style: { width: '300px' } }, [h(ClipTrackPropertyToggle)]),
            h(
              Button,
              {
                id: 'edit-shadow',
                size: 'sm',
                variant: 'secondary',
                onClick: () => state.updateSelectedAppearance({ shadowSize: 'lg' }),
              },
              'Change shadow',
            ),
            h(
              'div',
              {
                ref: scroll,
                style: { position: 'relative', width: '800px', height: '180px', marginTop: '30px', overflow: 'auto' },
              },
              [
                h(TimelineSurfaceCanvas),
                ...['images', 'another-track'].map((trackId) =>
                  h('div', { style: { position: 'relative', height: '48px', marginBottom: '16px' } }, [
                    h(TimelineCanvasClips, {
                      clips: composition.value.clips.filter((clip) => clip.trackId === trackId),
                      displayedClip: (clip: Clip) => clip,
                      assetFor: () => composition.value.assets[0]!,
                      durationMs: 10000,
                      width: 800,
                      viewport: { left: 0, top: 0, width: 800, height: 180 },
                      thumbnailSlots: [],
                      deferMedia: false,
                      selectedIds: new Set(state.selectedClipIds.value),
                      linkedNames: () => [],
                      trimStateFor: () => undefined,
                    }),
                  ]),
                ),
              ],
            ),
          ]);
      },
    }),
  );
  app.use(i18n);
  app.mount(root);
  await nextTick();
}
