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
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import { AlignCenter, AlignLeft, AlignRight, Bold, Italic, Strikethrough, Upload } from '@lucide/vue';
import { loadCaptionFont, useFontCatalog } from './useFontCatalog';

const { t } = useTranslate('CaptionClipPanel');
const props = defineProps<{ style: CaptionStyle; defaultFontSize: number; sampleText?: string }>();
const emit = defineEmits<{
  (event: 'update', key: keyof CaptionStyle, value: CaptionStyle[keyof CaptionStyle]): void;
  (event: 'preview', patch: Partial<CaptionStyle> | null): void;
}>();
const { fonts, loading, error, refreshSystem, importFont } = useFontCatalog();
let previewSequence = 0;
const previewFont = async (value: string | number | null) => {
  const sequence = ++previewSequence;
  if (value === null) return emit('preview', null);
  const font = fonts.value.find((item) => item.value === value);
  if (!font) return;
  try {
    await loadCaptionFont(font);
    if (sequence === previewSequence && error.value === 'fontLoadFailed') error.value = null;
    if (sequence === previewSequence) emit('preview', { fontFamily: font.value, fontAssetId: font.assetId });
  } catch {
    if (sequence === previewSequence) {
      error.value = 'fontLoadFailed';
      emit('preview', null);
    }
  }
};
const commitFont = async (value: string | number) => {
  const font = fonts.value.find((item) => item.value === value);
  if (!font) return;
  try {
    await loadCaptionFont(font);
  } catch {
    emit('preview', null);
    error.value = 'fontLoadFailed';
    return;
  }
  if (error.value === 'fontLoadFailed') error.value = null;
  emit('update', 'fontFamily', font.value);
  emit('update', 'fontAssetId', font.assetId);
};
const pickFont = async () => {
  const font = await importFont();
  if (font) await commitFont(font.value);
};

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
    <div class="font-row">
      <Select
        :model-value="style.fontFamily ?? 'sans-serif'"
        :options="fonts"
        :loading="loading"
        :option-height="58"
        :search-placeholder="t('searchFonts')"
        :no-results-label="t('noFontsFound')"
        variant="search"
        size="sm"
        @toggle="$event && refreshSystem()"
        @preview:model-value="previewFont"
        @update:model-value="commitFont"
      >
        <template #option="{ option }">
          <span class="font-option">
            <span class="option-label">{{ option.label }}</span>
            <span class="font-sample" :style="{ fontFamily: String(option.value) }">{{
              sampleText || t('fontSample')
            }}</span>
          </span>
        </template>
      </Select>
      <Button
        :icon="Upload"
        icon-only
        size="sm"
        variant="outline"
        :loading="loading"
        :tooltip="t('importFont')"
        :aria-label="t('importFont')"
        @click="pickFont"
      />
    </div>
    <p v-if="error" class="font-error" role="status">{{ t(error) }}</p>
    <ButtonGroup full :aria-label="t('textStyle')">
      <Button
        :icon="Bold"
        icon-only
        size="xs"
        :variant="style.fontWeight === 800 ? 'primary' : 'ghost'"
        :tooltip="t('bold')"
        :aria-label="t('bold')"
        @click="emit('update', 'fontWeight', style.fontWeight === 800 ? 400 : 800)"
      />
      <Button
        :icon="Italic"
        icon-only
        size="xs"
        :variant="style.fontStyle === 'italic' ? 'primary' : 'ghost'"
        :tooltip="t('italic')"
        :aria-label="t('italic')"
        @click="emit('update', 'fontStyle', style.fontStyle === 'italic' ? 'normal' : 'italic')"
      />
      <Button
        :icon="Strikethrough"
        icon-only
        size="xs"
        :variant="style.textDecoration === 'line-through' ? 'primary' : 'ghost'"
        :tooltip="t('strikethrough')"
        :aria-label="t('strikethrough')"
        @click="emit('update', 'textDecoration', style.textDecoration === 'line-through' ? 'none' : 'line-through')"
      />
    </ButtonGroup>
    <ButtonGroup full :aria-label="t('textAlignment')">
      <Button
        v-for="item in [
          { value: 'left', icon: AlignLeft, label: t('alignLeft') },
          { value: 'center', icon: AlignCenter, label: t('alignCenter') },
          { value: 'right', icon: AlignRight, label: t('alignRight') },
        ]"
        :key="item.value"
        :icon="item.icon"
        icon-only
        size="xs"
        :variant="style.textAlign === item.value ? 'primary' : 'ghost'"
        :tooltip="item.label"
        :aria-label="item.label"
        @click="emit('update', 'textAlign', item.value as CaptionStyle['textAlign'])"
      />
    </ButtonGroup>
    <div class="sub-group">
      <span class="sub-label">{{ t('textColor') }}</span>
      <ColorPicker
        :model-value="style.color"
        :show-label="false"
        @update:model-value="emit('update', 'color', $event)"
      />
    </div>
    <BigSlider
      :label="t('lineHeight')"
      :model-value="style.lineHeight ?? 1.2"
      :min="0.8"
      :max="2"
      :step="0.05"
      :default-value="1.2"
      :format-value="(value) => value.toFixed(2)"
      @update:model-value="emit('update', 'lineHeight', $event)"
    />
    <BigSlider
      :label="t('letterSpacing')"
      :model-value="style.letterSpacing ?? 0"
      :min="-5"
      :max="20"
      :step="0.5"
      :default-value="0"
      :format-value="(value) => `${value}px`"
      @update:model-value="emit('update', 'letterSpacing', $event)"
    />
    <BigSlider
      :label="t('fontSize')"
      :model-value="style.fontSize"
      :min="12"
      :max="256"
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
.font-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px;
  align-items: center;
}
.font-option {
  display: flex;
  min-width: 0;
  flex-direction: column;
  line-height: 1.2;
}
.font-sample {
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.font-error {
  margin: 0;
  color: var(--color-error);
  font-size: 10px;
}
</style>
