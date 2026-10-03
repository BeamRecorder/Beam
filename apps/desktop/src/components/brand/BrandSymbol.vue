<script setup lang="ts">
import { FolderOpen, Settings } from '@lucide/vue';
import { resolvePublicAssetUrl } from '~/utils/public-asset';
import type { BrandSymbol } from './brand-types';

defineProps<{ symbol: BrandSymbol; size: number }>();
const beamIcon = resolvePublicAssetUrl('/brand/BeamIcon.webp');
</script>

<template>
  <span class="brand-symbol" :class="{ 'is-panel-icon': symbol !== 'beam' }" :data-symbol="symbol" aria-hidden="true">
    <img v-if="symbol === 'beam'" :src="beamIcon" :width="size" :height="size" alt="" draggable="false" />
    <component v-else :is="symbol === 'folder' ? FolderOpen : Settings" :size="size" />
  </span>
</template>

<style scoped>
.brand-symbol {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.is-panel-icon {
  color: var(--text-secondary);
}
.brand-symbol img {
  display: block;
}
</style>
