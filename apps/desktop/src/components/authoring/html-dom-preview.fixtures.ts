import { markRaw, ref, watch } from 'vue';
import { htmlSceneFixture } from '../../../../../packages/engine/src/html/tests/html-scene-fixture';
import type { HtmlDomPreviewProps } from './html-dom-preview-types';

export function htmlPreviewFixture() {
  const fixture = htmlSceneFixture();
  const { clip, asset, html } = fixture;
  const currentTime = ref(1);
  const props: HtmlDomPreviewProps = {
    preview: { clip, asset, html },
    clock: markRaw({
      currentTime: () => currentTime.value,
      subscribe: (listener: (seconds: number) => void) => watch(currentTime, listener, { flush: 'sync' }),
    }),
    bounds: { left: '10px', top: '20px', width: '960px', height: '540px' },
    documentReady: true,
    documentError: '',
  };
  return { ...fixture, props, currentTime };
}
