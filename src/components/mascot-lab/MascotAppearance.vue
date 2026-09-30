<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Sparkles, Star, Ellipsis, SlidersHorizontal } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Select from '~/ui/select/Select.vue';
import Switch from '~/ui/switch/Switch.vue';
import Input from '~/ui/input/Input.vue';
import MascotSvg from './MascotSvg.vue';
import { SHAPES } from './bot/skins';
import { EXPRESSIONS } from './bot/expressions';
import { createMascotEngine, EXPRESSION_LABELS, PALETTE, SHAPE_LABELS } from './mascot-catalog';
import type { MascotLook } from './mascot-types';
import type { ExpressionId } from './bot/bot-types';

const look = defineModel<MascotLook>({ required: true });
const colorDraft = ref(look.value.color);
const colorError = computed(() =>
  /^#[0-9a-f]{6}$/i.test(colorDraft.value) ? false : 'Utilise une couleur comme #FF5A1F.',
);
watch(
  () => look.value.color,
  (value) => {
    colorDraft.value = value;
  },
);
const emit = defineEmits<{ expression: [] }>();
const previews = computed(() =>
  SHAPES.map((shape) => ({
    id: shape.id,
    frame: createMascotEngine({ ...look.value, shape: shape.id }).sample(0.8),
  })),
);
const expressionOptions = EXPRESSIONS.map((expression) => ({
  value: expression.id,
  label: EXPRESSION_LABELS[expression.id],
}));
const eyeStyles = [
  { id: 'sparkle' as const, label: 'Éclats', icon: Sparkles },
  { id: 'star' as const, label: 'Étoiles', icon: Star },
  { id: 'capsule' as const, label: 'Gélules', icon: Ellipsis },
];
const changeExpression = (value: string | number) => {
  look.value.expression = value as ExpressionId;
  emit('expression');
};
const changeColor = (value: string | number) => {
  colorDraft.value = String(value);
  if (!colorError.value) look.value.color = colorDraft.value;
};
</script>

<template>
  <aside class="appearance">
    <header class="panel-heading">
      <SlidersHorizontal :size="17" />
      <h2>Son petit look</h2>
    </header>
    <section class="appearance-section">
      <h3>Silhouette <span>8 formes</span></h3>
      <div class="shape-grid">
        <Button
          v-for="preview in previews"
          :key="preview.id"
          variant="card"
          :class="{ 'is-selected': look.shape === preview.id }"
          :aria-label="SHAPE_LABELS[preview.id]"
          :aria-pressed="look.shape === preview.id"
          @click="look.shape = preview.id"
        >
          <span class="shape-choice"
            ><MascotSvg :frame="preview.frame" :color="look.color" :size="54" /><span>{{
              SHAPE_LABELS[preview.id]
            }}</span></span
          >
        </Button>
      </div>
    </section>
    <section class="appearance-section">
      <h3>Des yeux qui brillent</h3>
      <div class="eye-grid">
        <Button
          v-for="style in eyeStyles"
          :key="style.id"
          variant="tab"
          :class="{ active: look.eyes === style.id }"
          :icon="style.icon"
          :aria-pressed="look.eyes === style.id"
          @click="look.eyes = style.id"
          >{{ style.label }}</Button
        >
      </div>
    </section>
    <section class="appearance-section">
      <h3>
        Couleur <span>{{ look.color.toUpperCase() }}</span>
      </h3>
      <div class="palette">
        <Button
          v-for="color in PALETTE"
          :key="color"
          variant="ghost"
          icon-only
          :aria-label="`Couleur ${color}`"
          :aria-pressed="look.color === color"
          :style="{
            background: color,
            borderRadius: '50%',
            width: '26px',
            height: '26px',
            border: '1px solid var(--color-border)',
            outline: look.color === color ? '2px solid var(--text-primary)' : undefined,
            outlineOffset: '3px',
          }"
          @click="look.color = color"
        />
      </div>
      <Input
        :model-value="colorDraft"
        :error="colorError"
        size="sm"
        aria-label="Couleur personnalisée au format hexadécimal"
        @update:model-value="changeColor"
      />
    </section>
    <section class="appearance-section">
      <h3>Humeur au repos</h3>
      <Select
        :model-value="look.expression"
        :options="expressionOptions"
        size="sm"
        aria-label="Humeur au repos"
        @update:model-value="changeExpression"
      />
    </section>
    <div class="blush-row">
      <span>Petites joues rosées</span><Switch v-model="look.blush" aria-label="Petites joues rosées" />
    </div>
    <p class="appearance-note">Une bulle, deux étoiles,<br />et un peu de personnalité.</p>
  </aside>
</template>

<style scoped>
.appearance {
  padding: 24px;
  background: var(--color-bg-element);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}
.panel-heading {
  display: flex;
  align-items: center;
  gap: 10px;
}
.panel-heading h2 {
  font-size: 15px;
  font-weight: 650;
}
.panel-heading svg {
  color: var(--text-muted);
}
.appearance-section {
  margin-top: 23px;
}
.appearance-section h3 {
  font-size: 11px;
  font-weight: 650;
  margin-bottom: 12px;
  display: flex;
  justify-content: space-between;
}
.appearance-section h3 span {
  color: var(--text-muted);
  font-weight: 400;
  font-size: 10px;
}
.shape-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}
.shape-choice {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4px 0 8px;
  font-size: 9px;
  font-weight: 450;
}
.eye-grid {
  display: flex;
  gap: 2px;
  padding: 4px;
  background: var(--color-bg-app);
  border-radius: var(--radius-md);
}
.palette {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 13px 9px;
  padding: 4px;
  margin-bottom: 16px;
}
.blush-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-top: 20px;
  font-size: 11px;
}
.appearance-note {
  margin-top: 25px;
  padding-top: 18px;
  border-top: 1px solid var(--color-border);
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.7;
}
</style>
