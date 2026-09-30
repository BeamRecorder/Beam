<script setup lang="ts">
import { RotateCcw } from '@lucide/vue';
import Slider from '~/ui/slider/Slider.vue';
import Button from '~/ui/button/Button.vue';
import { DEFAULT_EYE_GEOMETRY, EYE_GEOMETRY_LIMITS } from '../Beamy/engine/eye-geometry';
import type { EyeGeometry } from '../Beamy/engine/bot-types';

const geometry = defineModel<EyeGeometry>({ required: true });
const controls: Array<{ key: keyof EyeGeometry; label: string }> = [
  { key: 'size', label: 'Taille des yeux' },
  { key: 'width', label: 'Largeur des yeux' },
  { key: 'height', label: 'Hauteur des yeux' },
  { key: 'spacing', label: 'Écartement des yeux' },
  { key: 'offsetY', label: 'Position verticale' },
];
const update = (key: keyof EyeGeometry, value: number) => {
  const next = value / 100;
  const [min, max] = EYE_GEOMETRY_LIMITS[key];
  if (!Number.isFinite(next) || next < min || next > max) return;
  geometry.value = { ...geometry.value, [key]: next };
};
</script>

<template>
  <div class="eye-controls">
    <div v-for="control in controls" :key="control.key" class="eye-control">
      <span>{{ control.label }}</span>
      <Slider
        :model-value="Math.round(geometry[control.key] * 100)"
        :min="EYE_GEOMETRY_LIMITS[control.key][0] * 100"
        :max="EYE_GEOMETRY_LIMITS[control.key][1] * 100"
        :step="1"
        size="compact"
        value-suffix="%"
        :label="control.label"
        @update:model-value="update(control.key, $event)"
      />
    </div>
    <Button variant="ghost" size="xs" :icon="RotateCcw" @click="geometry = { ...DEFAULT_EYE_GEOMETRY }"
      >Réinitialiser les yeux</Button
    >
  </div>
</template>

<style scoped>
.eye-controls {
  display: grid;
  gap: 12px;
  margin-top: 16px;
}
.eye-control {
  display: grid;
  gap: 8px;
  font-size: var(--font-size-body);
  color: var(--text-secondary);
}
</style>
