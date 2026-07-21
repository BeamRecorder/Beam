<script setup lang="ts">
import Button from '~/ui/button/Button.vue'
import ButtonGroup from '~/ui/button/ButtonGroup.vue'
import { Sun, Moon, Monitor } from '@lucide/vue'
import { useThemeStore } from '~/stores/theme'

const themeStore = useThemeStore()
</script>

<template>
  <div class="options-group">
    <div class="prop-item">
      <span class="prop-label">Theme Mode</span>
      <ButtonGroup class="theme-button-group">
        <Button 
          :class="{ active: themeStore.theme === 'light' }"
          variant="tab"
          size="sm"
          @click="themeStore.theme = 'light'"
        >
          <template #icon><Sun class="btn-icon" /></template>
          Light
        </Button>
        <Button 
          :class="{ active: themeStore.theme === 'dark' }"
          variant="tab"
          size="sm"
          @click="themeStore.theme = 'dark'"
        >
          <template #icon><Moon class="btn-icon" /></template>
          Dark
        </Button>
        <Button 
          :class="{ active: themeStore.theme === 'system' }"
          variant="tab"
          size="sm"
          @click="themeStore.theme = 'system'"
        >
          <template #icon><Monitor class="btn-icon" /></template>
          System
        </Button>
      </ButtonGroup>
    </div>
  </div>
</template>

<style scoped>
.options-group {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.prop-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.prop-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.theme-button-group {
  width: 100%;
}

.theme-button-group :deep(.btn) {
  flex: 1;
  justify-content: center;
}

.btn-icon {
  width: 14px;
  height: 14px;
}
</style>
