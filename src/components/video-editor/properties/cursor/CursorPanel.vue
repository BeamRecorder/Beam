<script setup lang="ts">
import BigSlider from '~/ui/slider/BigSlider.vue'
import Switch from '~/ui/switch/Switch.vue'
import Select from '~/ui/select/Select.vue'
import ColorInput from '~/ui/input/ColorInput.vue'
import ShadowDirectionGroup from '../ShadowDirectionGroup.vue'
import CursorClickEffectsPanel from './CursorClickEffectsPanel.vue'
import type { ShadowDirection } from '../shadow-types'
import { cursorOptions, type CursorType } from './useCursorReplacer'
import type { CursorClickEffects } from '../../../../api/types/cursor-settings'
import { useTranslate } from '~/i18n/useTranslate'

const { t } = useTranslate('CursorPanel')

defineProps<{
  selectedCursor: CursorType
  cursorSize: number
  cursorColor: string
  enableShadow: boolean
  shadowBlur: number
  shadowColor: string
  shadowDirection: ShadowDirection
  clickEffects: CursorClickEffects
}>()

const emit = defineEmits<{
  (e: 'update:selectedCursor', value: CursorType): void
  (e: 'update:cursorSize', value: number): void
  (e: 'update:cursorColor', value: string): void
  (e: 'update:enableShadow', value: boolean): void
  (e: 'update:shadowBlur', value: number): void
  (e: 'update:shadowColor', value: string): void
  (e: 'update:shadowDirection', value: ShadowDirection): void
  (e: 'update:clickEffects', value: CursorClickEffects): void
}>()
</script>

<template>
  <div class="options-group">
    <div class="prop-item">
      <label class="prop-label">{{ t('cursorStyle') }}</label>
      <Select 
        :model-value="selectedCursor" 
        :options="cursorOptions" 
        :preview-on-hover="true"
        @update:modelValue="emit('update:selectedCursor', $event)"
      />
    </div>

    <div class="prop-item">
      <BigSlider 
        :model-value="cursorSize" 
        :default-value="24"
        :min="16" 
        :max="64"
        :label="t('cursorSize')"
        :format-value="(val) => `${val}px`"
        @update:modelValue="emit('update:cursorSize', $event)"
      />
    </div>

    <ColorInput 
      :label="t('cursorColor')"
      :model-value="cursorColor"
      @update:modelValue="emit('update:cursorColor', $event)"
    />

    <div class="prop-row">
      <span class="prop-label">{{ t('dropShadow') }}</span>
      <Switch 
        :model-value="enableShadow" 
        @update:modelValue="emit('update:enableShadow', $event)"
      />
    </div>

    <Transition name="slide-fade">
      <div v-if="enableShadow" class="nested-options">
        <div class="prop-item">
          <BigSlider 
            :model-value="shadowBlur" 
            :min="1" 
            :max="24"
            :label="t('shadowBlur')"
            :format-value="(val) => `${val}px`"
            @update:modelValue="emit('update:shadowBlur', $event)"
          />
        </div>

        <ColorInput 
          :label="t('shadowColor')"
          :model-value="shadowColor"
          @update:modelValue="emit('update:shadowColor', $event)"
        />

        <div class="prop-item">
          <span class="sub-label">{{ t('direction') }}</span>
          <ShadowDirectionGroup
            :model-value="shadowDirection"
            @update:model-value="emit('update:shadowDirection', $event)"
          />
        </div>
      </div>
    </Transition>

    <CursorClickEffectsPanel
      :model-value="clickEffects"
      @update:model-value="emit('update:clickEffects', $event)"
    />

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
  gap: 6px;
}

.nested-options {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  margin-top: -4px;
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

.sub-label {
  color: var(--text-muted);
  font-size: 11px;
}

/* Slide fade transition for switch toggling */
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  max-height: 250px;
  overflow: hidden;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  opacity: 0;
  max-height: 0;
  transform: translateY(-8px);
  padding-top: 0;
  padding-bottom: 0;
  margin-top: 0;
  margin-bottom: 0;
  border-color: transparent;
}
</style>
