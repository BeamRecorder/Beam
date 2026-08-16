<script setup lang="ts">
import BigSlider from '~/ui/slider/BigSlider.vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import ColorPicker from '~/ui/ColorPicker/ColorPicker.vue';
import DeleteItem from '~/ui/button/DeleteItem.vue';
import Divider from '~/ui/divider/Divider.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { BlurEffectMode, BlurEffectShape } from '~/media/shared/composition-types';

const { t } = useTranslate('BlurPropertiesPanel');
const props = defineProps<{
  clip: {
    mode: BlurEffectMode;
    shape: BlurEffectShape;
    strength: number;
    feather: number;
    tintOpacity: number;
    color: string;
    enabled?: boolean;
  };
}>();
const emit = defineEmits<{
  (
    event: 'update',
    patch: Partial<{
      mode: BlurEffectMode;
      shape: BlurEffectShape;
      strength: number;
      feather: number;
      tintOpacity: number;
      color: string;
    }>,
  ): void;
  (event: 'update:enabled', value: boolean): void;
  (event: 'delete'): void;
}>();

const modes = [
  { value: 'blur', label: t('blur') },
  { value: 'frosted', label: t('frosted') },
  { value: 'pixelated', label: t('pixelated') },
  { value: 'opaque', label: t('opaque') },
] as const;

const selectMode = (mode: BlurEffectMode) => {
  emit('update', {
    mode,
    ...(mode === 'frosted' && props.clip.tintOpacity < 20 ? { tintOpacity: 24 } : {}),
  });
};
const shapes = [
  { value: 'rectangle', label: t('rectangle') },
  { value: 'square', label: t('square') },
  { value: 'circle', label: t('circle') },
] as const;
</script>

<template>
  <div class="blur-properties">
    <div class="section-block">
      <div class="section-header">
        <span class="section-title">{{ t('mode') }}</span>
      </div>
      <ButtonGroup full>
        <Button
          v-for="item in modes"
          :key="item.value"
          :variant="clip.mode === item.value ? 'primary' : 'ghost'"
          size="xs"
          @click="selectMode(item.value)"
        >
          {{ item.label }}
        </Button>
      </ButtonGroup>
    </div>
    <Divider spacing="xs" />
    <div class="section-block">
      <div class="section-header">
        <span class="section-title">{{ t('shape') }}</span>
      </div>
      <ButtonGroup full>
        <Button
          v-for="item in shapes"
          :key="item.value"
          :variant="clip.shape === item.value ? 'primary' : 'ghost'"
          size="xs"
          @click="emit('update', { shape: item.value })"
        >
          {{ item.label }}
        </Button>
      </ButtonGroup>
      <BigSlider
        v-if="clip.mode !== 'opaque'"
        :model-value="clip.strength"
        :min="0"
        :max="100"
        :step="1"
        :label="t('strength')"
        :format-value="(value) => `${Math.round(value)}%`"
        @update:model-value="emit('update', { strength: $event })"
      />
      <BigSlider
        :model-value="clip.feather"
        :min="0"
        :max="100"
        :step="1"
        :label="t('feather')"
        :format-value="(value) => `${Math.round(value)}%`"
        @update:model-value="emit('update', { feather: $event })"
      />
      <BigSlider
        v-if="clip.mode !== 'opaque'"
        :model-value="clip.tintOpacity"
        :min="0"
        :max="100"
        :step="1"
        :label="t('tintOpacity')"
        :format-value="(value) => `${Math.round(value)}%`"
        @update:model-value="emit('update', { tintOpacity: $event })"
      />
      <ColorPicker
        v-if="clip.mode === 'opaque' || clip.tintOpacity > 0"
        :model-value="clip.color"
        :label="t('color')"
        @update:model-value="emit('update', { color: $event })"
      />
      <p class="privacy-hint">{{ t('privacyHint') }}</p>
    </div>
    <Divider spacing="xs" />
    <Button variant="ghost" size="sm" block @click="emit('update:enabled', !clip.enabled)">{{
      clip.enabled === false ? t('enable') : t('disable')
    }}</Button>
    <DeleteItem :label="t('delete')" @click="emit('delete')" />
  </div>
</template>

<style scoped>
.privacy-hint {
  margin: 8px 0 0;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.45;
}
</style>
