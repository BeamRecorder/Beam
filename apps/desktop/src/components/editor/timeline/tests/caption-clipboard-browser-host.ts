import '../../../../style.css';
import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import { createPinia } from 'pinia';
import { i18n } from '../../../../i18n';
import { useClipComposition } from '../../composables/useClipComposition';
import { normalizeEditorPreferenceDefaults } from '../../composables/editor-defaults';
import { pasteTimelineClipboard } from '../composables/paste-timeline-clipboard';
import type { TimelinePasteRequest } from '../composables/timeline-clipboard-types';
import type { TimelineItemSelectionRequest } from '../composables/timeline-tracks-types';
import type { ClipComposition } from '@beam/engine';
import TimelineTracks from '../TimelineTracks.vue';
import { unmountWorkspace } from './workspace-browser-host';
import { unmountTimeline } from './timeline-browser-host';

let active: ReturnType<typeof createApp> | undefined;
let model: ReturnType<typeof useClipComposition> | undefined;

export async function mountCaptionTimeline(composition: ClipComposition, timeMs: number) {
  active?.unmount();
  unmountWorkspace();
  unmountTimeline();
  document.body.innerHTML = '<div id="test" style="width:1100px;height:500px"></div>';
  const component = defineComponent({
    setup() {
      const currentTime = ref(timeMs / 1000);
      const state = useClipComposition({
        project: ref({
          id: 'browser-project',
          name: 'Browser project',
          createdAt: '',
          updatedAt: '',
          sessionCount: 0,
          previewSrc: null,
        }),
        editorData: ref(null),
        currentTimeSec: currentTime,
        activeTab: ref('canvas'),
        editorDefaults: ref(normalizeEditorPreferenceDefaults(undefined)),
      });
      model = state;
      state.restoreComposition(composition);
      const paste = (request: TimelinePasteRequest) => {
        const result = pasteTimelineClipboard({
          ...request,
          composition: state.composition.value,
          zoomElements: [],
          timelineDurationMs: 10000,
        });
        state.restoreComposition(result.composition);
        state.selectClips(result.clipIds, result.primary.id);
      };
      return () =>
        h(TimelineTracks, {
          composition: state.composition.value,
          currentTime: currentTime.value,
          duration: 10,
          isPlaying: false,
          zoomLevel: 100,
          zoomElements: [],
          selectedZoomId: null,
          selectedZoomIds: [],
          projectId: 'browser-project',
          selectedClipId: state.selectedClipId.value,
          selectedClipIds: state.selectedClipIds.value,
          'onSelect:item': (request: TimelineItemSelectionRequest) => state.selectClip(request.id),
          'onUpdate:currentTime': (time: number) => {
            currentTime.value = time;
          },
          'onPaste:item': paste,
        });
    },
  });
  active = createApp(component).use(createPinia()).use(i18n);
  active.mount('#test');
  await nextTick();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

export const captionTimelineSnapshot = (): ClipComposition => {
  if (!model) throw new Error('No caption timeline is mounted');
  return JSON.parse(JSON.stringify(model.composition.value)) as ClipComposition;
};

export function unmountCaptionTimeline() {
  active?.unmount();
  active = undefined;
  model = undefined;
}
