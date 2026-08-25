<script setup lang="ts">
import { computed } from 'vue';
import { SlidersHorizontal } from '@lucide/vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import ColorPicker from '~/ui/ColorPicker/ColorPicker.vue';
import Divider from '~/ui/divider/Divider.vue';
import Switch from '~/ui/switch/Switch.vue';
import ShadowDirectionGroup from '../cursor/ShadowDirectionGroup.vue';
import type { ColorClip } from '~/media/shared/composition-types';
import { normalizeColorLayerStyle } from '~/media/shared/color-layer-style';
import type {
  ColorLayerShadowDirection,
  ColorLayerShadowMode,
  ColorLayerShadowSize,
  ColorLayerStyle,
} from '~/media/shared/color-layer-style-types';
import { useTranslate } from '~/i18n/useTranslate';
import { useClipCornerRadius } from './useClipCornerRadius';

const props = defineProps<{ clip: ColorClip }>();
const emit = defineEmits<{
  (event: 'update', patch: Partial<ColorLayerStyle>): void;
  (event: 'corner-radius-interaction', interacting: boolean): void;
}>();
const { t } = useTranslate('ClipPropertiesPanel');
const { t: tCanvas } = useTranslate('CanvasPanel');
const style = computed(() => normalizeColorLayerStyle(props.clip));

const radiusPresets = computed(() => [
  { id: 'none', label: t('none') },
  { id: 'sm', label: '8px' },
  { id: 'md', label: '16px' },
  { id: 'lg', label: '24px' },
  { id: 'custom', icon: SlidersHorizontal, tooltip: t('custom') },
]);
const shadowPresets = computed(() => [
  { id: 'none', label: t('none') },
  { id: 'sm', label: t('soft') },
  { id: 'md', label: t('medium') },
  { id: 'lg', label: t('strong') },
  { id: 'custom', icon: SlidersHorizontal, tooltip: t('custom') },
]);
const {
  selectedRadius,
  customRadiusValue,
  handleRadiusChange,
  handleCustomRadiusChange,
  beginRadiusInteraction,
  endRadiusInteraction,
} = useClipCornerRadius({
  selectedClip: () => ({ id: props.clip.id, cornerRadius: style.value.cornerRadius }),
  onUpdate: (radius) =>
    emit('update', {
      cornerRadius: ['none', 'sm', 'md', 'lg'].includes(radius)
        ? (radius as 'none' | 'sm' | 'md' | 'lg')
        : Number(radius),
    }),
  onInteractionChange: (interacting) => emit('corner-radius-interaction', interacting),
});
const selectShadow = (shadowSize: string) => emit('update', { shadowSize: shadowSize as ColorLayerShadowSize });
const updateShadowMode = (shadowMode: ColorLayerShadowMode) => emit('update', { shadowMode });
const updateShadowDirection = (shadowDirection: ColorLayerShadowDirection) => emit('update', { shadowDirection });
</script>

<template>
  <section class="appearance-controls" :aria-label="tCanvas('colorLayerAppearance')">
    <div class="section-block">
      <span class="section-title">{{ t('cornerRadius') }}</span>
      <ButtonGroup full>
        <Button
          v-for="preset in radiusPresets"
          :key="preset.id"
          size="xs"
          :variant="selectedRadius === preset.id ? 'primary' : 'ghost'"
          :icon="preset.icon"
          :icon-only="!!preset.icon"
          :tooltip="preset.tooltip"
          :aria-label="preset.tooltip || preset.label"
          @click="handleRadiusChange(preset.id)"
        >
          <span v-if="preset.label">{{ preset.label }}</span>
        </Button>
      </ButtonGroup>
      <BigSlider
        v-if="selectedRadius === 'custom'"
        :model-value="customRadiusValue"
        :min="0"
        :max="200"
        :step="1"
        :default-value="32"
        :label="t('radius')"
        :format-value="(value) => `${Math.round(value)}px`"
        @update:model-value="handleCustomRadiusChange"
        @interaction-start="beginRadiusInteraction"
        @interaction-end="endRadiusInteraction"
      />
    </div>

    <Divider spacing="xs" />

    <div class="section-block">
      <span class="section-title">{{ t('dropShadow') }}</span>
      <ButtonGroup full>
        <Button
          v-for="preset in shadowPresets"
          :key="preset.id"
          size="xs"
          :variant="style.shadowSize === preset.id ? 'primary' : 'ghost'"
          :icon="preset.icon"
          :icon-only="!!preset.icon"
          :tooltip="preset.tooltip"
          :aria-label="preset.tooltip || preset.label"
          @click="selectShadow(preset.id)"
        >
          <span v-if="preset.label">{{ preset.label }}</span>
        </Button>
      </ButtonGroup>
      <template v-if="style.shadowSize !== 'none'">
        <div class="sub-group">
          <span class="sub-label">{{ t('shadowStyle') }}</span>
          <ButtonGroup full>
            <Button
              size="xs"
              :variant="style.shadowMode === 'solid' ? 'primary' : 'ghost'"
              @click="updateShadowMode('solid')"
            >
              {{ t('solid') }}
            </Button>
            <Button
              size="xs"
              :variant="style.shadowMode === 'adaptive' ? 'primary' : 'ghost'"
              @click="updateShadowMode('adaptive')"
            >
              {{ t('adaptive') }}
            </Button>
          </ButtonGroup>
          <span v-if="style.shadowMode === 'adaptive'" class="hint">{{ t('adaptiveShadowDescription') }}</span>
        </div>
        <BigSlider
          v-if="style.shadowSize === 'custom'"
          :model-value="style.shadowBlur"
          :min="4"
          :max="96"
          :step="1"
          :default-value="40"
          :label="t('shadowBlur')"
          :format-value="(value) => `${Math.round(value)}px`"
          @update:model-value="emit('update', { shadowSize: 'custom', shadowBlur: $event })"
        />
        <div class="sub-group">
          <span class="sub-label">{{ t('direction') }}</span>
          <ShadowDirectionGroup :model-value="style.shadowDirection" @update:model-value="updateShadowDirection" />
        </div>
        <div v-if="style.shadowMode === 'solid'" class="sub-group">
          <span class="sub-label">{{ t('shadowColor') }}</span>
          <ColorPicker
            :model-value="style.shadowColor"
            :show-label="false"
            @update:model-value="emit('update', { shadowColor: $event })"
          />
        </div>
      </template>
    </div>

    <Divider spacing="xs" />

    <div class="toggle-control">
      <div class="toggle-heading">
        <span class="section-title">{{ tCanvas('colorLayerOpacity') }}</span>
        <Switch
          :model-value="style.opacityEnabled"
          :aria-label="tCanvas('colorLayerOpacity')"
          @update:model-value="emit('update', { opacityEnabled: $event })"
        />
      </div>
      <BigSlider
        v-if="style.opacityEnabled"
        :model-value="style.opacity"
        :min="0"
        :max="100"
        :step="1"
        :default-value="70"
        :label="tCanvas('colorLayerOpacity')"
        :format-value="(value) => `${Math.round(value)}%`"
        @update:model-value="emit('update', { opacity: $event })"
      />
    </div>

    <Divider spacing="xs" />

    <div class="toggle-control">
      <div class="toggle-heading">
        <span class="section-title">{{ tCanvas('colorLayerBackdropBlur') }}</span>
        <Switch
          :model-value="style.backdropBlurEnabled"
          :aria-label="tCanvas('colorLayerBackdropBlur')"
          @update:model-value="emit('update', { backdropBlurEnabled: $event })"
        />
      </div>
      <BigSlider
        v-if="style.backdropBlurEnabled"
        :model-value="style.backdropBlur"
        :min="0"
        :max="100"
        :step="1"
        :default-value="35"
        :label="tCanvas('colorLayerBackdropBlur')"
        :format-value="(value) => `${Math.round(value)}%`"
        @update:model-value="emit('update', { backdropBlur: $event })"
      />
    </div>
  </section>
</template>

<style scoped>
.appearance-controls,
.section-block,
.toggle-control,
.sub-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-title,
.sub-label {
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
}

.section-title {
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.sub-label {
  color: var(--text-muted);
}

.toggle-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 24px;
}

.hint {
  color: var(--text-muted);
  font-size: 10px;
  line-height: 1.4;
}
</style>
