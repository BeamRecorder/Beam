<script setup lang="ts">
import { computed, ref } from 'vue';
import AdvancedButton from '~/ui/button/AdvancedButton.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import Switch from '~/ui/switch/Switch.vue';
import BlurRevealTransition from '~/ui/transitions/BlurRevealTransition.vue';
import {
  normalizeZoomAutoFollow,
  ZOOM_AUTO_FOLLOW_PRESETS,
  type ZoomAutoFollowPreset,
  type ZoomAutoFollowSettings,
} from '~/components/video-editor/zoom/zoom-types';
import { useTranslate } from '~/i18n/useTranslate';

const { t } = useTranslate('ZoomPanel');
const props = defineProps<{ modelValue: ZoomAutoFollowSettings }>();
const emit = defineEmits<{ (event: 'update:modelValue', value: ZoomAutoFollowSettings): void }>();

const advancedOpen = ref(false);
const presets: ZoomAutoFollowPreset[] = ['stable', 'balanced', 'responsive'];
const activePreset = computed(() =>
  presets.find((preset) => {
    const value = ZOOM_AUTO_FOLLOW_PRESETS[preset];
    return (
      value.safeZone === props.modelValue.safeZone &&
      value.responsiveness === props.modelValue.responsiveness &&
      value.directionLock === props.modelValue.directionLock
    );
  }),
);
const update = (patch: Partial<ZoomAutoFollowSettings>) =>
  emit('update:modelValue', normalizeZoomAutoFollow({ ...props.modelValue, ...patch }));
const selectPreset = (preset: ZoomAutoFollowPreset) =>
  emit('update:modelValue', { ...ZOOM_AUTO_FOLLOW_PRESETS[preset] });
</script>

<template>
  <div class="section-block auto-follow-settings">
    <div class="section-header">
      <div class="setting-copy">
        <span class="section-title">{{ t('cameraFollow') }}</span>
        <span class="section-description">{{ t('cameraFollowDesc') }}</span>
      </div>
      <AdvancedButton
        :open="advancedOpen"
        controls="zoom-auto-follow-advanced-panel"
        :label="t('advanced')"
        @update:open="advancedOpen = $event"
      />
    </div>
    <ButtonGroup class="auto-follow-presets" full>
      <Button
        v-for="preset in presets"
        :key="preset"
        size="xs"
        :variant="activePreset === preset ? 'primary' : 'ghost'"
        :data-auto-follow-preset="preset"
        @click="selectPreset(preset)"
      >
        {{ t(`followPreset${preset[0]!.toUpperCase()}${preset.slice(1)}`) }}
      </Button>
    </ButtonGroup>
    <BlurRevealTransition>
      <div v-if="advancedOpen" id="zoom-auto-follow-advanced-panel" class="advanced-options">
        <BigSlider
          :model-value="modelValue.safeZone * 100"
          :min="25"
          :max="75"
          :step="1"
          :default-value="50"
          :label="t('safeZone')"
          :format-value="(value) => `${Math.round(value)}%`"
          @update:model-value="update({ safeZone: $event / 100 })"
        />
        <BigSlider
          :model-value="modelValue.responsiveness * 100"
          :min="0"
          :max="100"
          :step="1"
          :default-value="55"
          :label="t('responsiveness')"
          :format-value="(value) => `${Math.round(value)}%`"
          @update:model-value="update({ responsiveness: $event / 100 })"
        />
        <div class="section-header">
          <div class="setting-copy">
            <span class="section-title">{{ t('straightPaths') }}</span>
            <span class="section-description">{{ t('straightPathsDesc') }}</span>
          </div>
          <Switch
            :model-value="modelValue.directionLock"
            :aria-label="t('straightPaths')"
            @update:model-value="update({ directionLock: $event })"
          />
        </div>
      </div>
    </BlurRevealTransition>
  </div>
</template>

<style scoped>
.section-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 20px;
}

.setting-copy,
.advanced-options {
  display: grid;
  gap: 3px;
}

.advanced-options {
  gap: 12px;
}

.section-title {
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
}

.section-description {
  max-width: 220px;
  color: var(--text-muted);
  font-size: 10px;
  line-height: 1.35;
}
</style>
