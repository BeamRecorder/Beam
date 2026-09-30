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
      :style="{ background: SURFACE_TONES.neutral[skin].bgApp }"
    >
      <span
        class="preview-window"
        :style="{ background: SURFACE_TONES.neutral[skin].bgSurface, borderColor: SURFACE_TONES.neutral[skin].border }"
      >
        <span class="preview-sidebar" :style="{ background: SURFACE_TONES.neutral[skin].bgElement }">
          <span
            v-for="row in 3"
            :key="row"
            class="sidebar-line"
            :style="{ background: SURFACE_TONES.neutral[skin].bgSurfaceHover }"
          />
        </span>
        <span class="preview-page"
          ><span class="page-heading" :style="{ background: SURFACE_TONES.neutral[skin].bgSurfaceHover }" /><span
            class="page-card"
            :style="{ background: SURFACE_TONES.neutral[skin].bgElement }"
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
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.preview-skin {
  position: absolute;
  inset: 0;
  padding: 12px;
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
  height: 3px;
  width: 50%;
  border-radius: var(--radius-xs);
}
.page-card {
  flex: 1;
  border-radius: var(--radius-xs);
}
</style>
