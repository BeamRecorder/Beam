<script setup lang="ts">
import Switch from '~/ui/switch/Switch.vue'
</script>

<template>
  <div class="options-group">
    <p class="info-text">Select range on the timeline at the bottom to cut, trim or crop your video clip.</p>
    <div class="prop-row">
      <span class="prop-label">Enable Trim Mode</span>
      <Switch :model-value="true" disabled />
    </div>
  </div>
</template>

<style scoped>
.options-group {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.prop-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
}

.prop-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.info-text {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.4;
}
</style>
