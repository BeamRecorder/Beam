// Browser integration fixture: real Beam Vue preview and document registration, no native window.
import { createApp, h, reactive, watch } from 'vue';
import HtmlDomPreview from '../../../apps/desktop/src/components/authoring/HtmlDomPreview.vue';
import { useAuthoringHost } from '../../../apps/desktop/src/components/authoring/useAuthoringHost';
import { createCommandRegistry } from '@beam/engine/commands/command-registry';
import { htmlPreviewFixture } from '../../../apps/desktop/src/components/authoring/html-dom-preview.fixtures';

const fixture = htmlPreviewFixture();
const props = reactive(fixture.props);
props.documentReady = false;
const time = fixture.currentTime;
const controller = { props, time, playhead: 0, playing: false, ticks: [], raf: 0 };
Object.assign(window, { previewCheck: controller });
createApp({
  setup() {
    const authoring = useAuthoringHost({
      context: () => ({ projectId: 'test', name: 'Ai-Native', kind: 'video' }),
      read: () => ({ value: 1 }),
      commands: createCommandRegistry(),
      validate: () => {},
      apply: () => {},
      undo: async () => {},
      redo: async () => {},
      canUndo: () => false,
      canRedo: () => false,
      canEdit: () => false,
      save: async () => {},
    });
    watch(
      authoring.ready,
      (ready) => {
        props.documentReady = ready;
      },
      { immediate: true, flush: 'sync' },
    );
    watch(authoring.error, (error) => {
      props.documentError = error;
    });
    return () =>
      h('div', { class: 'canvas-viewport' }, [
        h('canvas', { class: 'editor-canvas', width: 960, height: 540 }),
        h(HtmlDomPreview, props),
        h('div', {
          class: 'canvas-selection-probe',
          style: { position: 'absolute', left: '200px', top: '200px', width: '20px', height: '20px', zIndex: 40 },
        }),
      ]);
  },
}).mount('#app');
