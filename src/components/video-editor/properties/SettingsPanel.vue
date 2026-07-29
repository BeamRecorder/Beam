<script setup lang="ts">
import Button from '~/ui/button/Button.vue'
import ButtonGroup from '~/ui/button/ButtonGroup.vue'
import Select from '~/ui/select/Select.vue'
import { Sun, Moon, Monitor } from '@lucide/vue'
import { useThemeStore } from '~/stores/theme'
import { useLocaleStore } from '~/stores/locale'
import { useTranslate } from '~/i18n/useTranslate'
import UpdateControls from '~/components/updates/UpdateControls.vue'

const { t } = useTranslate('SettingsPanel')
const themeStore = useThemeStore()
const localeStore = useLocaleStore()

const localeOptions = [
  { value: 'en', label: 'EN - English - Anglais' },
  { value: 'fr', label: 'FR - French - Français' },
]
</script>

<template>
  <div class="options-group">
    <div class="prop-item">
      <span class="prop-label">{{ t('themeMode') }}</span>
      <ButtonGroup class="theme-button-group">
        <Button 
          :class="{ active: themeStore.theme === 'light' }"
          variant="tab"
          size="sm"
          @click="themeStore.theme = 'light'"
        >
          <template #icon><Sun class="btn-icon" /></template>
          {{ t('light') }}
        </Button>
        <Button 
          :class="{ active: themeStore.theme === 'dark' }"
          variant="tab"
          size="sm"
          @click="themeStore.theme = 'dark'"
        >
          <template #icon><Moon class="btn-icon" /></template>
          {{ t('dark') }}
        </Button>
        <Button 
          :class="{ active: themeStore.theme === 'system' }"
          variant="tab"
          size="sm"
          @click="themeStore.theme = 'system'"
        >
          <template #icon><Monitor class="btn-icon" /></template>
          {{ t('system') }}
        </Button>
      </ButtonGroup>
    </div>

    <div class="prop-item">
      <span class="prop-label">{{ t('language') }}</span>
      <Select
        :model-value="localeStore.locale"
        :options="localeOptions"
        direction="up"
        @update:model-value="localeStore.setLocale($event)"
      />
    </div>

    <div class="prop-item">
      <UpdateControls />
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
