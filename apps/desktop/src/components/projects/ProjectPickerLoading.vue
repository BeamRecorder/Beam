<script setup lang="ts">
import Skeleton from '~/ui/skeleton/Skeleton.vue';
import { useTranslate } from '~/i18n/useTranslate';
const { t } = useTranslate('ProjectPicker');
</script>

<template>
  <div class="picker-loading" role="status" :aria-label="t('loadingProjects')">
    <Skeleton width="120px" height="16px" />
    <Skeleton width="200px" height="10px" />
    <div class="loading-grid">
      <Skeleton v-for="index in 6" :key="index" height="140px" />
    </div>
  </div>
</template>

<style scoped>
.picker-loading {
  height: min(440px, calc(100vh - 96px));
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-sizing: border-box;
  overflow: hidden;
}
.loading-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;
}
</style>
