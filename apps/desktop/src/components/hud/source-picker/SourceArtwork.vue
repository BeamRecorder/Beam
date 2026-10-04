<script setup lang="ts">
import { Monitor, PanelsTopLeft } from '@lucide/vue';
import type { SourcePickerSource } from '~/api/types/source-picker';
import DevelopmentSourceArtwork from './DevelopmentSourceArtwork.vue';

defineProps<{ source: SourcePickerSource; live?: boolean }>();
</script>

<template>
  <DevelopmentSourceArtwork v-if="source.artwork" :source="source" :live="live" />
  <img v-else-if="source.thumbnail" :src="source.thumbnail" alt="" draggable="false" class="native-thumbnail" />
  <span v-else class="unavailable"
    ><component :is="source.kind === 'screen' ? Monitor : PanelsTopLeft" :size="26"
  /></span>
</template>

<style scoped>
.native-thumbnail {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.unavailable {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  color: var(--text-muted);
  background: var(--color-bg-well);
}
</style>
