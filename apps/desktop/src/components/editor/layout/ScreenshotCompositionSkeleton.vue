<script setup lang="ts">
import { ref } from 'vue';
import { useMediaQuery } from '@vueuse/core';
import Skeleton from '~/ui/skeleton/Skeleton.vue';
import EditorSkeletonSurface from './EditorSkeletonSurface.vue';
import ScreenshotLayerControls from '../../screenshot/composition/ScreenshotLayerControls.vue';
import ScreenshotEffectToolbar from '../../screenshot/gradient/ScreenshotEffectToolbar.vue';
import { useCompositionPanelPosition } from '../../screenshot/composition/useCompositionPanelPosition';
const panel = ref<HTMLElement | null>(null);
const content = ref<HTMLElement | null>(null);
const collapsed = useMediaQuery('(max-width: 1180px)');
const { ready, upward } = useCompositionPanelPosition(panel, () => undefined, content, collapsed);
</script>

<template>
  <div ref="panel" class="screenshot-composition" :class="{ positioning: !ready, upward }">
    <div class="composition-surface screenshot-chrome">
      <header class="composition-header"><Skeleton variant="animated-gradient" width="100%" height="100%" /></header>
      <div v-if="!collapsed || !ready" ref="content" class="composition-content">
        <EditorSkeletonSurface
          ><ScreenshotLayerControls disabled /><ScreenshotEffectToolbar disabled
        /></EditorSkeletonSurface>
        <div class="layer-list">
          <div class="layer-rows">
            <div v-for="index in 3" :key="index" class="layer-row">
              <Skeleton variant="animated-gradient" width="100%" height="100%" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="../../screenshot/composition/screenshot-composition.css"></style>
<style scoped src="../../screenshot/screenshot-chrome.css"></style>
