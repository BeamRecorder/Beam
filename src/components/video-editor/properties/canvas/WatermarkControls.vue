<script setup lang="ts">
import { computed } from 'vue';
import { ArrowDownLeft, ArrowDownRight, ArrowUpLeft, ArrowUpRight, SlidersHorizontal } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import Switch from '~/ui/switch/Switch.vue';
import Input from '~/ui/input/Input.vue';
import ColorPicker from '~/ui/ColorPicker/ColorPicker.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { resolvePublicAssetUrl } from '~/utils/public-asset';
import { DEFAULT_WATERMARK, normalizeWatermark, type WatermarkSettings } from '../../canvas/output-canvas';

const props = defineProps<{ modelValue?: WatermarkSettings }>();
const emit = defineEmits<{ (event: 'update:modelValue', value: WatermarkSettings): void }>();
const { t } = useTranslate('CanvasPanel');
const value = computed(() => normalizeWatermark(props.modelValue ?? DEFAULT_WATERMARK));
const renderedText = (text: WatermarkSettings['text'], localized: boolean, customText?: string) =>
  text === 'none'
    ? ''
    : text === 'custom'
      ? (customText ?? '')
      : localized
        ? t(text === 'beam' ? 'beam' : 'madeWithBeam')
        : text === 'beam'
          ? 'Beam'
          : 'Made with Beam.';
const update = (patch: Partial<WatermarkSettings>) => {
  const next = { ...value.value, ...patch };
  next.renderedText = renderedText(next.text, next.localized, next.customText);
  emit('update:modelValue', next);
};
const textChoices = computed(() => [
  { value: 'none' as const, label: t('noWatermarkText') },
  { value: 'made-with-beam' as const, label: t('madeWithBeam') },
  { value: 'beam' as const, label: t('beam') },
  { value: 'custom' as const, icon: SlidersHorizontal, tooltip: t('custom') },
]);
const positions = [
  { value: 'top-left' as const, icon: ArrowUpLeft, label: 'watermarkTopLeft' },
  { value: 'top-right' as const, icon: ArrowUpRight, label: 'watermarkTopRight' },
  { value: 'bottom-left' as const, icon: ArrowDownLeft, label: 'watermarkBottomLeft' },
  { value: 'bottom-right' as const, icon: ArrowDownRight, label: 'watermarkBottomRight' },
];
</script>

<template>
  <div class="watermark-section">
    <div class="toggle-row">
      <div class="heading">
        <img :src="resolvePublicAssetUrl('/brand/BeamIcon.webp')" alt="" class="logo" />
        <div>
          <span class="title">{{ t('watermark') }}</span
          ><span class="description">{{ t('watermarkDescription') }}</span>
        </div>
      </div>
      <Switch
        :model-value="value.enabled"
        :aria-label="t('watermark')"
        @update:model-value="update({ enabled: $event })"
      />
    </div>
    <div v-if="value.enabled" class="options">
      <div class="option">
        <span class="option-label">{{ t('watermarkText') }}</span>
        <ButtonGroup full>
          <Button
            v-for="choice in textChoices"
            :key="choice.value"
            :variant="value.text === choice.value ? 'primary' : 'ghost'"
            size="xs"
            :icon="choice.icon"
            :icon-only="!!choice.icon"
            :tooltip="choice.tooltip"
            :aria-label="choice.tooltip || choice.label"
            @click="update({ text: choice.value })"
          >
            <span v-if="choice.label">{{ choice.label }}</span>
          </Button>
        </ButtonGroup>
      </div>
      <div v-if="value.text === 'custom'" class="option">
        <span class="option-label">{{ t('customWatermarkText') }}</span>
        <Input
          size="sm"
          :model-value="value.customText ?? ''"
          :placeholder="t('watermarkCustomTextPlaceholder')"
          :debounce="150"
          @update:model-value="update({ customText: String($event) })"
        />
      </div>
      <div class="toggle-row compact">
        <span class="option-label">{{ t('showBeamLogo') }}</span
        ><Switch
          :model-value="value.showLogo"
          :aria-label="t('showBeamLogo')"
          @update:model-value="update({ showLogo: $event })"
        />
      </div>
      <div v-if="value.text !== 'none' && value.text !== 'custom'" class="toggle-row compact">
        <span class="option-label">{{ t('translateWatermark') }}</span
        ><Switch
          :model-value="value.localized"
          :aria-label="t('translateWatermark')"
          @update:model-value="update({ localized: $event })"
        />
      </div>
      <div class="option">
        <span class="option-label">{{ t('watermarkPosition') }}</span
        ><ButtonGroup full :aria-label="t('watermarkPosition')"
          ><Button
            v-for="position in positions"
            :key="position.value"
            :icon="position.icon"
            icon-only
            size="xs"
            :variant="value.position === position.value ? 'primary' : 'ghost'"
            :tooltip="t(position.label)"
            :aria-label="t(position.label)"
            @click="update({ position: position.value })"
        /></ButtonGroup>
      </div>
      <BigSlider
        :model-value="value.size"
        :min="50"
        :max="200"
        :step="10"
        :label="t('watermarkSize')"
        :format-value="(size: number) => `${Math.round(size)}%`"
        @update:model-value="update({ size: $event })"
      />
      <BigSlider
        :model-value="value.shadow"
        :min="0"
        :max="100"
        :step="5"
        :label="t('watermarkShadow')"
        :format-value="(shadow: number) => `${Math.round(shadow)}%`"
        @update:model-value="update({ shadow: $event })"
      />
      <ColorPicker
        :model-value="value.backgroundColor"
        :label="t('watermarkBackgroundColor')"
        @update:model-value="update({ backgroundColor: $event })"
      />
      <BigSlider
        :model-value="value.backgroundOpacity"
        :min="0"
        :max="100"
        :step="5"
        :label="t('watermarkBackgroundOpacity')"
        :format-value="(opacity: number) => `${Math.round(opacity)}%`"
        @update:model-value="update({ backgroundOpacity: $event })"
      />
      <BigSlider
        :model-value="value.backgroundRadius"
        :min="0"
        :max="100"
        :step="5"
        :label="t('watermarkBackgroundRadius')"
        :format-value="(radius: number) => `${Math.round(radius)}%`"
        @update:model-value="update({ backgroundRadius: $event })"
      />
      <BigSlider
        :model-value="value.backgroundPadding"
        :min="50"
        :max="150"
        :step="5"
        :label="t('watermarkBackgroundPadding')"
        :format-value="(padding: number) => `${Math.round(padding)}%`"
        @update:model-value="update({ backgroundPadding: $event })"
      />
    </div>
  </div>
</template>

<style scoped>
.watermark-section,
.options,
.option,
.heading > div {
  display: grid;
  gap: 12px;
}
.watermark-section {
  padding-top: 12px;
  border-top: 1px solid var(--color-border);
}
.toggle-row,
.heading {
  display: flex;
  align-items: center;
  gap: 10px;
}
.toggle-row {
  justify-content: space-between;
}
.heading {
  min-width: 0;
}
.heading > div,
.option {
  gap: 6px;
}
.logo {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
}
.title,
.option-label {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
}
.description {
  display: block;
  color: var(--text-muted);
  font-size: 10px;
  line-height: 1.35;
}
.options {
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}
.compact {
  min-height: 28px;
}
</style>
