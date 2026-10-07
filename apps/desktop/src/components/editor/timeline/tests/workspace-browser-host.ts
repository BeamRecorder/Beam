import '../../../../style.css';
import { createApp, defineComponent, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { i18n } from '../../../../i18n';
import { useEditorWorkspace } from '../../workspace/useEditorWorkspace';
import { provideEditorWorkspace } from '../../workspace/workspace-context';
import VideoEditorTracks from '../../workspace/VideoEditorTracks.vue';
import VideoEditorPreview from '../../workspace/VideoEditorPreview.vue';
import VideoEditorProperties from '../../workspace/VideoEditorProperties.vue';
import type { ClipComposition } from '@beam/engine';
import { unmountTimeline } from './timeline-browser-host';

let active: ReturnType<typeof createApp> | undefined;
export async function mountWorkspace(composition: ClipComposition) {
  active?.unmount();
  unmountTimeline();
  document.body.innerHTML = '<div id="test"></div>';
  const component = defineComponent({
    setup() {
      const workspace = useEditorWorkspace({ project: null, editorData: null }, () => {});
      provideEditorWorkspace(workspace);
      workspace.compositionState.restoreComposition(composition);
      workspace.duration.value = 10;
      workspace.timelineZoomLevel.value = 100;
      return () =>
        h('div', [
          h('div', { style: 'display:flex;height:300px' }, [h(VideoEditorProperties), h(VideoEditorPreview)]),
          h(VideoEditorTracks),
        ]);
    },
  });
  active = createApp(component).use(createPinia()).use(i18n);
  active.mount('#test');
  await nextTick();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
export function unmountWorkspace() {
  active?.unmount();
  active = undefined;
}
