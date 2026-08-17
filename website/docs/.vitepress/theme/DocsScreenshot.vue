<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ImageOff } from '@lucide/vue';
import { withBase } from 'vitepress';

const props = withDefaults(
  defineProps<{
    path: string;
    alt: string;
    caption?: string;
    aspectRatio?: string;
  }>(),
  { caption: '', aspectRatio: '16 / 10' },
);

const loaded = ref(false);
const publicPath = computed(() => withBase(`/screenshots/${props.path}`));
const expectedPath = computed(() => `website/docs/public/screenshots/${props.path}`);

watch(
  () => props.path,
  () => {
    loaded.value = false;
  },
);
</script>

<template>
  <figure class="docs-screenshot">
    <div class="docs-screenshot__frame" :style="{ aspectRatio }">
      <img
        :class="{ 'is-loaded': loaded }"
        :src="publicPath"
        :alt="alt"
        loading="lazy"
        @load="loaded = true"
        @error="loaded = false"
      />
      <div v-if="!loaded" class="docs-screenshot__missing" role="status">
        <ImageOff aria-hidden="true" />
        <strong>Screenshot pending</strong>
        <span>Add the image at:</span>
        <code>{{ expectedPath }}</code>
      </div>
    </div>
    <figcaption v-if="caption">{{ caption }}</figcaption>
  </figure>
</template>

<style scoped>
.docs-screenshot {
  margin: 28px 0;
}

.docs-screenshot__frame {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-lg);
  background: var(--color-bg-surface);
  box-shadow: var(--shadow-md);
}

.docs-screenshot img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity 160ms ease;
}

.docs-screenshot img.is-loaded {
  opacity: 1;
}

.docs-screenshot__missing {
  position: absolute;
  inset: 0;
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 8px;
  padding: 24px;
  color: var(--text-secondary);
  text-align: center;
}

.docs-screenshot__missing svg {
  width: 28px;
  height: 28px;
  color: var(--color-primary);
}

.docs-screenshot__missing strong {
  color: var(--text-primary);
  font-family: var(--font-headline);
  font-size: 18px;
}

.docs-screenshot__missing code {
  max-width: 100%;
  padding: 6px 9px;
  overflow-wrap: anywhere;
  border-radius: var(--radius-sm);
  background: var(--color-bg-element);
  color: var(--color-primary-hover);
  font-size: 12px;
}

.docs-screenshot figcaption {
  margin-top: 10px;
  color: var(--text-muted);
  font-size: 13px;
  text-align: center;
}
</style>
