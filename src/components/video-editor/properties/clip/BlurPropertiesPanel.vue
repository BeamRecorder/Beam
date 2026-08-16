<script setup lang="ts">
import { computed, type Component } from 'vue';
import {
  Circle,
  Grid3X3,
  LockKeyhole,
  RectangleHorizontal,
  ShieldCheck,
  Snowflake,
  Sparkles,
  Square,
  Waves,
} from '@lucide/vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import ColorPicker from '~/ui/ColorPicker/ColorPicker.vue';
import DeleteItem from '~/ui/button/DeleteItem.vue';
import Divider from '~/ui/divider/Divider.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { BlurClip, BlurEffectMode, BlurEffectShape } from '~/media/shared/composition-types';

type BlurSettings = Pick<BlurClip, 'mode' | 'shape' | 'strength' | 'feather' | 'tintOpacity' | 'color'> & {
  cornerRadius: number;
};
type BlurPatch = Partial<BlurSettings>;

const { t } = useTranslate('BlurPropertiesPanel');
const props = defineProps<{
  clip: BlurSettings & { enabled?: boolean };
}>();
const emit = defineEmits<{
  (event: 'update', patch: BlurPatch): void;
  (event: 'update:enabled', value: boolean): void;
  (event: 'delete'): void;
}>();

interface Choice<T> {
  value: T;
  label: string;
  icon: Component;
}

const modes: Array<Choice<BlurEffectMode>> = [
  { value: 'blur', label: t('blur'), icon: Waves },
  { value: 'frosted', label: t('frosted'), icon: Snowflake },
  { value: 'pixelated', label: t('pixelated'), icon: Grid3X3 },
  { value: 'opaque', label: t('opaque'), icon: LockKeyhole },
];
const shapes: Array<Choice<BlurEffectShape>> = [
  { value: 'rectangle', label: t('rectangle'), icon: RectangleHorizontal },
  { value: 'square', label: t('square'), icon: Square },
  { value: 'circle', label: t('circle'), icon: Circle },
];
const presets: Array<{ value: string; label: string; icon: Component; patch: BlurPatch }> = [
  {
    value: 'light',
    label: t('light'),
    icon: Sparkles,
    patch: { mode: 'blur', strength: 30, feather: 14, tintOpacity: 0 },
  },
  {
    value: 'privacy',
    label: t('privacy'),
    icon: ShieldCheck,
    patch: { mode: 'pixelated', strength: 72, feather: 2, tintOpacity: 0 },
  },
  {
    value: 'strong',
    label: t('strong'),
    icon: LockKeyhole,
    patch: { mode: 'opaque', strength: 100, feather: 0, tintOpacity: 0, color: '#000000' },
  },
];

const strengthLabel = computed(() => {
  if (props.clip.mode === 'blur') return t('blurRadius');
  if (props.clip.mode === 'frosted') return t('frostIntensity');
  return t('pixelSize');
});
const usesColor = computed(() => props.clip.mode === 'frosted' || props.clip.mode === 'opaque');
const usesTint = computed(() => props.clip.mode === 'frosted');

const selectMode = (mode: BlurEffectMode) => {
  emit('update', {
    mode,
    tintOpacity: mode === 'frosted' ? Math.max(24, props.clip.tintOpacity) : 0,
  });
};
const presetIsActive = (patch: BlurPatch) =>
  Object.entries(patch).every(([key, value]) => props.clip[key as keyof BlurSettings] === value);
</script>

<template>
  <div class="blur-properties">
    <section class="section-block" :aria-label="t('presets')">
      <span class="section-title">{{ t('presets') }}</span>
      <ButtonGroup full :columns="1" class="preset-group">
        <Button
          v-for="preset in presets"
          :key="preset.value"
          :variant="presetIsActive(preset.patch) ? 'primary' : 'secondary'"
          size="sm"
          block
          :icon="preset.icon"
          :data-preset="preset.value"
          @click="emit('update', preset.patch)"
        >
          {{ preset.label }}
        </Button>
      </ButtonGroup>
    </section>

    <Divider spacing="xs" />

    <section class="section-block" :aria-label="t('mode')">
      <span class="section-title">{{ t('mode') }}</span>
      <ButtonGroup full :columns="2" class="mode-group">
        <Button
          v-for="item in modes"
          :key="item.value"
          :variant="clip.mode === item.value ? 'primary' : 'secondary'"
          size="sm"
          block
          :icon="item.icon"
          @click="selectMode(item.value)"
        >
          {{ item.label }}
        </Button>
      </ButtonGroup>
    </section>

    <section class="section-block" :aria-label="t('shape')">
      <span class="section-title">{{ t('shape') }}</span>
      <ButtonGroup full :columns="3" class="shape-group">
        <Button
          v-for="item in shapes"
          :key="item.value"
          :variant="clip.shape === item.value ? 'primary' : 'secondary'"
          size="xs"
          block
          :icon="item.icon"
          @click="emit('update', { shape: item.value })"
        >
          {{ item.label }}
        </Button>
      </ButtonGroup>
    </section>

    <Divider spacing="xs" />

    <section class="section-block" :aria-label="t('appearance')">
      <span class="section-title">{{ t('appearance') }}</span>
      <div class="control-stack">
        <BigSlider
          v-if="clip.mode !== 'opaque'"
          :model-value="clip.strength"
          :min="0"
          :max="100"
          :step="1"
          :default-value="60"
          :label="strengthLabel"
          :format-value="(value) => `${Math.round(value)}%`"
          @update:model-value="emit('update', { strength: $event })"
        />
        <BigSlider
          :model-value="clip.feather"
          :min="0"
          :max="100"
          :step="1"
          :default-value="0"
          :label="t('feather')"
          :format-value="(value) => `${Math.round(value)}%`"
          @update:model-value="emit('update', { feather: $event })"
        />
        <BigSlider
          v-if="clip.shape !== 'circle'"
          :model-value="clip.cornerRadius"
          :min="0"
          :max="100"
          :step="1"
          :default-value="0"
          :label="t('cornerRadius')"
          :format-value="(value) => `${Math.round(value)}%`"
          @update:model-value="emit('update', { cornerRadius: $event })"
        />
        <BigSlider
          v-if="usesTint"
          :model-value="clip.tintOpacity"
          :min="0"
          :max="100"
          :step="1"
          :default-value="24"
          :label="t('tintOpacity')"
          :format-value="(value) => `${Math.round(value)}%`"
          @update:model-value="emit('update', { tintOpacity: $event })"
        />
        <ColorPicker
          v-if="usesColor"
          :model-value="clip.color"
          :label="t('color')"
          @update:model-value="emit('update', { color: $event })"
        />
      </div>
      <p class="privacy-hint">
        <ShieldCheck class="privacy-icon" aria-hidden="true" />
        <span>{{ t('privacyHint') }}</span>
      </p>
    </section>

    <Divider spacing="xs" />

    <div class="panel-actions">
      <Button variant="ghost" size="sm" block @click="emit('update:enabled', !clip.enabled)">
        {{ clip.enabled === false ? t('enable') : t('disable') }}
      </Button>
      <DeleteItem :label="t('delete')" @click="emit('delete')" />
    </div>
  </div>
</template>

<style scoped>
.blur-properties,
.section-block,
.control-stack,
.panel-actions {
  display: flex;
  flex-direction: column;
}

.blur-properties {
  gap: 2px;
}

.section-block {
  gap: 10px;
}

.section-title {
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.control-stack,
.panel-actions {
  display: grid;
  gap: 8px;
}

.privacy-hint {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin: 2px 0 0;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.45;
}

.privacy-icon {
  width: 14px;
  height: 14px;
  margin-top: 1px;
  flex: 0 0 auto;
  color: var(--color-primary);
}
</style>
