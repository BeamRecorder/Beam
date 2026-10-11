import { computed, createApp, h, nextTick, ref, shallowRef } from 'vue';
import CaptionInlineEditor from '../CaptionInlineEditor.vue';
import ElementCanvasOverlay from '../../elements/ElementCanvasOverlay.vue';
import { provideElementEditor } from '../../elements/useElementEditor';
import { useCaptionInlineEditing } from '../composables/useCaptionInlineEditing';
import { createDefaultCaptionStyle } from '@beam/engine/shared/composition-defaults';
import { createElementText } from '@beam/engine/shared/element-text';
import { normalizeShapeLayerStyle } from '@beam/engine/shared/shape-layer-style';
import { DEFAULT_OUTPUT_CANVAS } from '@beam/engine/layout/output-canvas';
import type { CaptionClip, ClipComposition, ShapeClip } from '@beam/engine/shared/composition-types';
import { i18n } from '~/i18n';

document.body.style.margin = '0';
document.body.style.background = '#202020';
document.documentElement.style.setProperty('--color-primary', '#ff6b24');
const mode = new URLSearchParams(location.search).get('mode');
const timing = { timelineStartMs: 0, timelineDurationMs: 3000, sourceInMs: 0, sourceDurationMs: 3000, playbackRate: 1 };
const original: CaptionClip = {
  ...timing,
  id: 'caption',
  kind: 'caption',
  name: 'Caption',
  enabled: true,
  order: 0,
  transform: { x: 0.2, y: 0.2, width: 0.5, height: 0.3 },
  caption: { type: 'text', sentences: [], style: { ...createDefaultCaptionStyle(32), customText: 'Hello' } },
};
const composition = shallowRef<ClipComposition>({
  schemaVersion: 14,
  assets: [],
  clips: [original],
  keyboardCaptionSessions: [],
});
const layers = shallowRef<ShapeClip[]>([
  {
    ...timing,
    ...normalizeShapeLayerStyle({ family: 'text', preset: 'text' }),
    id: 'text',
    kind: 'shape',
    assetId: '',
    name: 'Text',
    enabled: true,
    order: 0,
    transform: { x: 0.2, y: 0.2, width: 0.5, height: 0.3 },
    text: createElementText('Hello'),
  },
]);
let commits = 0;
const commit = (content: string | undefined) => {
  document.body.dataset.commits = String(++commits);
  document.body.dataset.saved = content ?? '';
};
createApp({
  setup() {
    const editor = provideElementEditor({
      layers: () => layers.value,
      selectedId: () => 'text',
      select: () => {},
      insert: () => {},
      remove: () => {},
      update: (_id, patch) => {
        commit(patch.text?.content);
        layers.value = layers.value.map((clip) => ({ ...clip, ...patch }));
      },
      timing: () => ({ startMs: 0, durationMs: 3000 }),
    });
    const caption = useCaptionInlineEditing({
      composition: () => composition.value,
      selectedClip: () => composition.value.clips.find((clip): clip is CaptionClip => clip.kind === 'caption') ?? null,
      isPlaying: () => false,
      isCropping: () => false,
      isManualZoom: () => false,
      logicalSize: ref({ width: 800, height: 450 }),
      outputCanvas: () => ({ ...DEFAULT_OUTPUT_CANVAS, width: 800, height: 450 }),
      selectionViewportStyle: () => ({}),
      selectionLayoutStyle: () => ({}),
      clipIdAt: () => 'caption',
      activeCaptionIds: () => ['caption'],
      onSelect: () => {},
      onStart: () => {},
      onRender: () => {},
      onUpdate: ({ customText }) => {
        commit(customText);
        composition.value = {
          ...composition.value,
          clips: [{ ...original, caption: { ...original.caption, style: { ...original.caption.style, customText } } }],
        };
      },
      onEnd: () => {},
    });
    if (mode === 'element') editor.beginText('text');
    else caption.begin({ button: 0, clientX: 0, clientY: 0 });
    const draft = computed(() =>
      mode === 'element' ? editor.editing.value?.text?.content : caption.editingCaption.value?.caption.style.customText,
    );
    return () =>
      h('main', { style: { position: 'relative', width: '800px', height: '450px' }, 'data-draft': draft.value }, [
        mode === 'element'
          ? h(ElementCanvasOverlay, {
              viewport: { x: 0, y: 0, width: 800, height: 450 },
              surfaceSize: { width: 800, height: 450 },
            })
          : caption.editingCaption.value
            ? h(CaptionInlineEditor, {
                clip: caption.editingCaption.value,
                viewportStyle: { inset: '0' },
                layoutStyle: { left: '100px', top: '100px', width: '400px', height: '200px' },
                renderScale: 1,
                warningPlacement: 'above',
                onUpdate: caption.update,
                onFinish: caption.finish,
                onCancel: caption.cancel,
              })
            : null,
        h('button', { id: 'finish', style: { position: 'absolute', bottom: '0' } }, 'Finish'),
      ]);
  },
})
  .use(i18n)
  .mount('#app');
await nextTick();
await nextTick();
document.body.dataset.ready = 'true';
