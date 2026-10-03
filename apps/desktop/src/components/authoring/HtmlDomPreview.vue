<script setup lang="ts">
import { ref } from 'vue';
import Skeleton from '~/components/ui/skeleton/Skeleton.vue';
import type { HtmlDomPreviewProps } from './html-dom-preview-types';
import { useHtmlDomPreview } from './useHtmlDomPreview';
const props = defineProps<HtmlDomPreviewProps>();
const frame = ref<HTMLIFrameElement | null>(null);
const { src, ready, error, iframeStyle, sync } = useHtmlDomPreview(props, frame);
</script>
<template>
  <div class="html-dom-preview" :style="bounds" :aria-busy="!ready && !error">
    <iframe
      v-if="src"
      ref="frame"
      :src="src"
      :style="iframeStyle"
      sandbox="allow-scripts"
      allow="autoplay 'none'; camera 'none'; microphone 'none'; display-capture 'none'"
      title="HTML composition preview"
      tabindex="-1"
      :class="{ ready }"
      @load="sync"
    />
    <div v-if="error" class="preview-error" role="alert">{{ error }}</div>
    <Skeleton v-else-if="!ready" class="preview-loading" height="100%" />
  </div>
</template>
<style scoped>
.html-dom-preview {
  position: absolute;
  z-index: 2;
  overflow: hidden;
  border-radius: 12px;
  pointer-events: none;
}
iframe {
  position: absolute;
  left: 0;
  top: 0;
  border: 0;
  transform-origin: top left;
  visibility: hidden;
}
iframe.ready {
  visibility: visible;
}
.preview-loading,
.preview-error {
  position: absolute;
  inset: 0;
}
.preview-error {
  display: grid;
  place-items: center;
  padding: 24px;
  color: var(--text-primary);
  background: var(--color-bg-surface);
}
</style>
