<script setup lang="ts">
import { computed } from 'vue';
import ColorPicker from '~/ui/ColorPicker/ColorPicker.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import Select from '~/ui/select/Select.vue';
import Switch from '~/ui/switch/Switch.vue';
import Divider from '~/ui/divider/Divider.vue';
import type { CaptionStyle } from '~/media/shared/composition-types';
import { useTranslate } from '~/i18n/useTranslate';
import BackdropBlurControl from './BackdropBlurControl.vue';

const { t } = useTranslate('CaptionClipPanel');
defineProps<{ style: CaptionStyle; defaultFontSize: number }>();
const emit = defineEmits<{
  (event: 'update', key: keyof CaptionStyle, value: CaptionStyle[keyof CaptionStyle]): void;
}>();

const shadowDirectionOptions = computed(() => [
  { value: 'all', label: t('shadowAllAround') },
  { value: 'bottom', label: t('shadowBottom') },
  { value: 'bottom-right', label: t('shadowBottomRight') },
  { value: 'top-left', label: t('shadowTopLeft') },
]);
</script>

<template>
  <div class="section-block">
    <span class="section-title">{{ t('typography') }}</span>
    <div class="sub-group">
      <span class="sub-label">{{ t('textColor') }}</span>
      <ColorPicker
        :model-value="style.color"
        :show-label="false"
        @update:model-value="emit('update', 'color', $event)"
      />
    </div>
    <BigSlider
      :label="t('fontSize')"
      :model-value="style.fontSize"
      :min="12"
      :max="120"
      :step="1"
      :default-value="defaultFontSize"
      :format-value="(value) => `${value}px`"
      @update:model-value="emit('update', 'fontSize', $event)"
    />
    <div class="wrap-setting">
      <div>
        <span class="sub-label">{{ t('textWrap') }}</span>
        <p class="section-desc">{{ t('textWrapDescription') }}</p>
      </div>
      <Switch
        :model-value="style.wrap !== false"
        :aria-label="t('textWrap')"
        @update:model-value="emit('update', 'wrap', $event)"
      />
    </div>
  </div>

  <Divider spacing="xs" />

  <div class="section-block">
    <span class="section-title">{{ t('outlineExtrusion') }}</span>
    <div class="sub-group">
      <span class="sub-label">{{ t('outlineColor') }}</span>
      <ColorPicker
        :model-value="style.outlineColor"
        :show-label="false"
        @update:model-value="emit('update', 'outlineColor', $event)"
      />
    </div>
    <BigSlider
      :label="t('outlineThickness')"
      :model-value="style.outlineWidth"
      :min="0"
      :max="30"
      :step="1"
      :default-value="6"
      :format-value="(value) => `${value}px`"
      @update:model-value="emit('update', 'outlineWidth', $event)"
    />
    <BigSlider
      :label="t('extrusionDepth')"
      :model-value="style.extrusionDepth"
      :min="0"
      :max="20"
      :step="1"
      :default-value="4"
      :format-value="(value) => `${value}px`"
      @update:model-value="emit('update', 'extrusionDepth', $event)"
    />
    <BackdropBlurControl
      :model-value="style.backdropBlur"
      @update:model-value="emit('update', 'backdropBlur', $event)"
    />
  </div>

  <Divider spacing="xs" />

  <div class="section-block">
    <span class="section-title">{{ t('textShadow') }}</span>
    <div class="sub-group">
      <span class="sub-label">{{ t('shadowColor') }}</span>
      <ColorPicker
        :model-value="style.shadowColor"
        :show-label="false"
        @update:model-value="emit('update', 'shadowColor', $event)"
      />
    </div>
    <div class="sub-group">
      <span class="sub-label">{{ t('direction') }}</span>
      <Select
        :items="shadowDirectionOptions"
        :model-value="style.shadowDirection ?? 'bottom-right'"
        size="sm"
        @update:model-value="emit('update', 'shadowDirection', $event as CaptionStyle['shadowDirection'])"
      />
    </div>
    <BigSlider
      :label="t('shadowBlur')"
      :model-value="style.shadowBlur"
      :min="0"
      :max="50"
      :step="1"
      :default-value="0"
      :format-value="(value) => `${value}px`"
      @update:model-value="emit('update', 'shadowBlur', $event)"
    />
  </div>
</template>

<style scoped>
.section-block,
.sub-group,
.wrap-setting > div {
  display: flex;
  flex-direction: column;
}
.section-block {
  gap: 10px;
}
.sub-group {
  gap: 6px;
  width: 100%;
}
.wrap-setting {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.wrap-setting > div {
  gap: 4px;
}
.section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}
.section-desc {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.4;
  margin: 0;
}
.sub-label {
  font-size: 10px;
  font-weight: 500;
  color: var(--text-muted);
}
</style>
