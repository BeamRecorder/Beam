<script setup lang="ts">
import { computed } from 'vue';
import { SURFACE_TONES } from '~/types/appearance';
import type { ThemeMode } from '~/types/appearance';

const props = defineProps<{ mode: ThemeMode }>();
const skins = computed(() => (props.mode === 'system' ? (['light', 'dark'] as const) : [props.mode]));
</script>

<template>
  <span class="theme-preview" :class="{ split: mode === 'system' }" aria-hidden="true">
    <span
      v-for="(skin, index) in skins"
      :key="skin"
      class="preview-skin"
      :class="{ 'split-right': index === 1 }"
      :style="{
        background: SURFACE_TONES.neutral[skin].bgApp,
        '--preview-ink': SURFACE_TONES.neutral[skin === 'dark' ? 'light' : 'dark'].borderStrong,
      }"
    >
      <span class="preview-window" :style="{ background: SURFACE_TONES.neutral[skin].bgSurfaceHover }">
        <span class="preview-sidebar" :style="{ background: SURFACE_TONES.neutral[skin].bgElement }">
          <span v-for="row in 3" :key="row" class="sidebar-line" />
        </span>
        <span class="preview-page"
          ><span class="page-heading" /><span
            class="page-card"
            :style="{ '--preview-card': SURFACE_TONES.neutral[skin].bgElement }"
        /></span>
      </span>
    </span>
  </span>
</template>

<style scoped>
.theme-preview {
  display: block;
  position: relative;
  width: 100%;
  height: 64px;
  border: 1px solid var(--color-border-strong);
  box-sizing: border-box;
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.preview-skin {
  position: absolute;
  inset: 0;
  padding: 10px 8px;
  display: flex;
}
.split .preview-skin:first-child {
  clip-path: inset(0 50% 0 0);
}
.split .split-right {
  clip-path: inset(0 0 0 50%);
}
.preview-window {
  display: flex;
  flex: 1;
  overflow: hidden;
  border: 1px solid;
  border-color: color-mix(in srgb, var(--preview-ink) 45%, transparent);
  border-radius: 5px;
}
.preview-sidebar {
  display: flex;
  flex-direction: column;
  width: 30%;
  gap: 4px;
  padding: 7px 5px;
}
.sidebar-line {
  background: color-mix(in srgb, var(--preview-ink) 80%, transparent);
  height: 3px;
  border-radius: var(--radius-xs);
}
.preview-page {
  flex: 1;
  padding: 7px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.page-heading {
  background: var(--preview-ink);
  height: 3px;
  width: 50%;
  border-radius: var(--radius-xs);
}
.page-card {
  background: color-mix(in srgb, var(--preview-card) 78%, var(--preview-ink));
  border: 1px solid color-mix(in srgb, var(--preview-ink) 30%, transparent);
  flex: 1;
  border-radius: var(--radius-xs);
}
</style>
