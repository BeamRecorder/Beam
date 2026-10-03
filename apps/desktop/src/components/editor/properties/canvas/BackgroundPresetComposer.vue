<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import Button from '~/ui/button/Button.vue';
import ColorPicker from '~/ui/ColorPicker/ColorPicker.vue';
import Gradient from '~/ui/Gradient/Gradient.vue';
import type { GradientBackground } from '@beam/engine/shared/background-types';
import { useTranslate } from '~/i18n/useTranslate';

const { t } = useTranslate('BackgroundPresetComposer');

const props = defineProps<{
  kind: 'color' | 'gradient';
  color: string;
  gradient: GradientBackground;
}>();

const emit = defineEmits<{
  (event: 'add-color', value: string): void;
  (event: 'add-gradient', value: GradientBackground): void;
  (event: 'update-color', value: string): void;
  (event: 'update-gradient', value: GradientBackground): void;
  (event: 'close'): void;
}>();

const cloneGradient = (value: GradientBackground): GradientBackground => ({
  ...value,
  stops: value.stops.map((stop) => ({ ...stop })),
});

const colorDraft = ref(props.color);
const gradientDraft = ref<GradientBackground>(cloneGradient(props.gradient));

watch(
  () => props.color,
  (value) => {
    colorDraft.value = value;
  },
);
watch(
  () => props.gradient,
  (value) => {
    gradientDraft.value = cloneGradient(value);
  },
  { deep: true },
);

let colorRaf: number | null = null;
let gradientRaf: number | null = null;

watch(colorDraft, (val) => {
  if (props.kind === 'color') {
    if (colorRaf !== null) cancelAnimationFrame(colorRaf);
    colorRaf = requestAnimationFrame(() => {
      emit('update-color', val);
      colorRaf = null;
    });
  }
});

watch(
  gradientDraft,
  (val) => {
    if (props.kind === 'gradient') {
      if (gradientRaf !== null) cancelAnimationFrame(gradientRaf);
      gradientRaf = requestAnimationFrame(() => {
        emit('update-gradient', cloneGradient(val));
        gradientRaf = null;
      });
    }
  },
  { deep: true },
);

onUnmounted(() => {
  if (colorRaf !== null) cancelAnimationFrame(colorRaf);
  if (gradientRaf !== null) cancelAnimationFrame(gradientRaf);
});

const add = () => {
  if (props.kind === 'color') emit('add-color', colorDraft.value);
  else emit('add-gradient', cloneGradient(gradientDraft.value));
};
</script>

<template>
  <section
    class="composer"
    :class="{ 'composer--color': kind === 'color' }"
    :aria-label="kind === 'color' ? t('addCustomColor') : t('addCustomGradient')"
  >
    <ColorPicker v-if="kind === 'color'" v-model="colorDraft" inline hide-header :show-label="false" type="standard" />
    <Gradient v-else v-model="gradientDraft" :show-angle="true" />
    <div class="composer-actions">
      <Button size="sm" variant="secondary" @click="emit('close')">{{ t('close') }}</Button>
      <Button size="sm" @click="add">{{ t('add') }}</Button>
    </div>
  </section>
</template>

<style scoped>
.composer {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  width: 280px;
  box-sizing: border-box;
  border-radius: var(--radius-md);
  color: var(--text-primary);
  animation: composer-in 140ms ease-out both;
}

.composer--color {
  width: 248px;
  padding: 0;
  gap: 0;
}

.composer--color .composer-actions {
  padding: 0 12px 12px;
}

.composer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

@keyframes composer-in {
  from {
    opacity: 0;
    transform: translate3d(0, -4px, 0);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .composer {
    animation: none;
  }
}
</style>
