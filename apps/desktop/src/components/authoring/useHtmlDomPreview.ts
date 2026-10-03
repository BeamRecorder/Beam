import { computed, onScopeDispose, ref, watch, type Ref } from 'vue';
import { capture } from '~/api/capture';
import { bindHtmlPlaybackSource } from '@beam/runtime/html/html-playback-source';
import type { HtmlDomPreviewProps } from './html-dom-preview-types';

/** DOM animation stays inside the sandbox; Beam's audio clock supplies every visual time. */
export function useHtmlDomPreview(props: HtmlDomPreviewProps, frame: Ref<HTMLIFrameElement | null>) {
  const src = ref(''),
    ready = ref(false),
    error = ref('');
  let generation = 0;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const previewId = () => `${props.preview.html.id}:${props.preview.html.revision}`;
  const send = (timeMs: number) =>
    frame.value?.contentWindow?.postMessage(
      {
        channel: 'beam-html-preview',
        previewId: previewId(),
        type: 'seek',
        timeMs,
      },
      '*',
    );
  let binding: ReturnType<typeof bindHtmlPlaybackSource>;
  watch(
    () => props.preview,
    (source) => {
      binding?.dispose();
      binding = bindHtmlPlaybackSource(source, props.clock, send);
    },
    { immediate: true, flush: 'sync' },
  );
  const sync = () => binding.sync();
  const receive = (event: MessageEvent) => {
    if (
      event.source !== frame.value?.contentWindow ||
      event.data?.channel !== 'beam-html-preview' ||
      event.data.previewId !== previewId()
    )
      return;
    if (event.data.type === 'ready') {
      clearTimeout(deadline);
      ready.value = true;
      sync();
    } else if (event.data.type === 'error' && typeof event.data.message === 'string') {
      clearTimeout(deadline);
      ready.value = false;
      error.value = event.data.message;
    }
  };
  window.addEventListener('message', receive);
  watch(
    () => (props.documentReady ? previewId() : ''),
    async () => {
      const request = ++generation;
      clearTimeout(deadline);
      src.value = '';
      ready.value = false;
      error.value = '';
      if (!props.documentReady) return;
      deadline = setTimeout(() => {
        error.value = 'HTML preview timed out.';
      }, 20000);
      try {
        const url = await capture.getHtmlPreviewSource(props.preview.html);
        if (request === generation) src.value = url;
      } catch (cause) {
        if (request === generation) {
          clearTimeout(deadline);
          error.value = String(cause);
        }
      }
    },
    { immediate: true },
  );
  watch(
    () => props.documentError,
    (message) => {
      if (message) error.value = message;
    },
  );
  const iframeStyle = computed(() => ({
    width: `${props.preview.html.width}px`,
    height: `${props.preview.html.height}px`,
    transform: `scale(${Number.parseFloat(String(props.bounds.width)) / props.preview.html.width})`,
  }));
  onScopeDispose(() => {
    binding.dispose();
    generation++;
    clearTimeout(deadline);
    window.removeEventListener('message', receive);
  });
  return { src, ready, error, iframeStyle, sync };
}
