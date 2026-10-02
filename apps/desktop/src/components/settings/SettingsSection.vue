<script setup lang="ts">
import type { Component } from 'vue';
defineProps<{ title: string; icon?: Component }>();
</script>
<template>
  <section class="settings-section" :aria-label="title">
    <h2 class="category-heading">
      <component v-if="icon" :is="icon" class="category-icon" :size="16" aria-hidden="true" /><span>{{ title }}</span>
    </h2>
    <div class="category-options"><slot /></div>
  </section>
</template>
<style scoped>
.settings-section {
  display: grid;
  gap: 10px;
  min-width: 0;
}
.category-heading {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0;
  font-size: var(--font-size-lg);
  line-height: 20px;
  font-weight: var(--weight-title);
  color: var(--text-primary);
}
.category-icon {
  display: block;
  flex: 0 0 16px;
  width: 16px;
  height: 16px;
  transform: translateY(-0.5px);
}
.category-heading span {
  min-width: 0;
}
.category-options {
  display: grid;
  gap: 16px;
  min-width: 0;
}
</style>
