<script setup lang="ts">
import { computed } from 'vue';
import { SlidersHorizontal } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import ColorPicker from '~/ui/ColorPicker/ColorPicker.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import Popover from '~/ui/popover/Popover.vue';
import BackgroundPresetComposer from '../canvas/BackgroundPresetComposer.vue';
import {
  DEFAULT_PHONE_FRAME_CONTINUITY,
  DEFAULT_PHONE_FRAME_FILL,
  DEFAULT_PHONE_FRAME_GRADIENT,
  type ColorGradient,
  type PhoneFrameFill,
} from '~/media/shared/color-fill-types';
import { useTranslate } from '~/i18n/useTranslate';

const { t } = useTranslate('BorderAndFrameControls');
const { t: tCanvas } = useTranslate('CanvasPanel');
const props = defineProps<{ modelValue?: PhoneFrameFill }>();
const emit = defineEmits<{
  (event: 'update:modelValue', value: PhoneFrameFill): void;
}>();

const fill = computed(() => props.modelValue ?? DEFAULT_PHONE_FRAME_FILL);
const mode = computed(() => fill.value.kind);
const color = computed(() => (fill.value.kind === 'color' ? fill.value.color : '#000000'));
const gradient = computed(() => (fill.value.kind === 'gradient' ? fill.value.gradient : DEFAULT_PHONE_FRAME_GRADIENT));
const continuity = computed(() => (fill.value.kind === 'continuity' ? fill.value : DEFAULT_PHONE_FRAME_CONTINUITY));

const selectMode = (next: PhoneFrameFill['kind']) => {
  if (next === 'adaptive') emit('update:modelValue', { kind: 'adaptive' });
  else if (next === 'continuity') emit('update:modelValue', { ...continuity.value });
  else if (next === 'gradient') {
    emit('update:modelValue', {
      kind: 'gradient',
      gradient: {
        ...gradient.value,
        stops: gradient.value.stops.map((stop) => ({ ...stop })),
      },
    });
  } else emit('update:modelValue', { kind: 'color', color: color.value });
};

const updateGradient = (value: { type?: 'linear' | 'radial'; angle?: number; stops: ColorGradient['stops'] }) =>
  emit('update:modelValue', {
    kind: 'gradient',
    gradient: {
      type: value.type ?? 'linear',
      angle: value.angle ?? 0,
      stops: value.stops.map((stop) => ({ ...stop, alpha: stop.alpha ?? 1 })),
    },
  });

const updateContinuity = (patch: Partial<Omit<typeof DEFAULT_PHONE_FRAME_CONTINUITY, 'kind'>>) =>
  emit('update:modelValue', { ...continuity.value, ...patch });
</script>

<template>
  <div class="phone-fill-controls">
    <span class="sub-label">{{ t('fitBackground') }}</span>
    <ButtonGroup full :columns="2">
      <Button
        v-for="item in ['color', 'gradient', 'adaptive', 'continuity'] as const"
        :key="item"
        :variant="mode === item ? 'primary' : 'ghost'"
        size="xs"
        @click="selectMode(item)"
      >
        {{ t(item) }}
      </Button>
    </ButtonGroup>
    <ColorPicker
      v-if="mode === 'color'"
      :model-value="color"
      :show-label="false"
      @update:modelValue="emit('update:modelValue', { kind: 'color', color: $event })"
    />
    <Popover v-else-if="mode === 'gradient'" block :match-trigger-width="false" flush>
      <template #trigger>
        <Button class="gradient-editor-trigger" variant="secondary" size="sm" block :icon="SlidersHorizontal">
          {{ tCanvas('edit') }}
        </Button>
      </template>
      <template #default="{ close }">
        <BackgroundPresetComposer
          kind="gradient"
          :color="color"
          :gradient="gradient"
          @update-gradient="updateGradient"
          @add-gradient="
            (value) => {
              updateGradient(value);
              close();
            }
          "
          @close="close"
        />
      </template>
    </Popover>
    <p v-else-if="mode === 'adaptive'" class="mode-description">{{ t('adaptiveDescription') }}</p>
    <div v-else class="continuity-controls">
      <p class="mode-description">{{ t('continuityDescription') }}</p>
      <BigSlider
        :model-value="continuity.blur"
        :min="0"
        :max="48"
        :step="1"
        :label="t('continuityBlur')"
        :format-value="(value) => `${Math.round(value)}px`"
        @update:modelValue="updateContinuity({ blur: $event })"
      />
      <BigSlider
        :model-value="continuity.brightness"
        :min="20"
        :max="100"
        :step="1"
        :label="t('continuityBrightness')"
        :format-value="(value) => `${Math.round(value)}%`"
        @update:modelValue="updateContinuity({ brightness: $event })"
      />
    </div>
  </div>
</template>

<style scoped>
.phone-fill-controls {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sub-label {
  font-size: 10px;
  font-weight: 500;
  color: var(--text-muted);
}

.continuity-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mode-description {
  margin: 0;
  font-size: 10px;
  line-height: 1.4;
  color: var(--text-muted);
}
</style>
