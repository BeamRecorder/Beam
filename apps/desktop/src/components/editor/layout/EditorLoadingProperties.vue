<script setup lang="ts">
import Button from '~/ui/button/Button.vue';
import Skeleton from '~/ui/skeleton/Skeleton.vue';
import { useTranslate } from '~/i18n/useTranslate';
import CanvasPanelLayout from '../properties/canvas/CanvasPanelLayout.vue';
import EditorSkeletonSurface from './EditorSkeletonSurface.vue';
import type { EditorLoadingPropertiesProps } from './editor-layout-types';
defineProps<EditorLoadingPropertiesProps>();
const { t } = useTranslate('CanvasPanel');
</script>

<template>
  <EditorSkeletonSurface>
    <CanvasPanelLayout :still="still" show-background active-kind="image" :blur-percent="0">
      <div class="media-scroll-grid">
        <div v-for="index in 10" :key="index" class="media-tile"><Skeleton width="100%" height="100%" /></div>
        <div class="load-more">
          <Button size="sm" variant="secondary" disabled block>{{ t('showMore') }}</Button>
        </div>
      </div>
    </CanvasPanelLayout>
  </EditorSkeletonSurface>
</template>

<style scoped src="../properties/canvas/canvas-panel.css"></style>
