<script setup lang="ts">
import { Eye, EyeOff, Sparkles, Palette } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Tooltip from '~/ui/tooltip/Tooltip.vue';
import LayerThumbnail from '../composition/thumbnails/LayerThumbnail.vue';
import { effectThumbnailId } from '../composition/thumbnails/effect-thumbnail';
import { useTranslate } from '~/i18n/useTranslate';
import type { LayerEffectListProps } from './gradient-panel-types';
defineProps<LayerEffectListProps>();
const emit = defineEmits<{ select: [id: string]; toggle: [id: string] }>();
const { t } = useTranslate('GradientEffect');
const { t: colorText } = useTranslate('ColorEffect');
const { t: effectText } = useTranslate('LayerEffects');
</script>
<template>
  <div v-if="layer.effects?.length" class="layer-effect-list" @pointerdown.stop @dblclick.stop @contextmenu.stop>
    <div v-for="(effect, index) in layer.effects" :key="effect.id" class="effect-row">
      <button
        class="effect-select"
        :class="{ selected: selectedEffectId === effect.id, inactive: !effect.enabled }"
        :disabled="disabled"
        :aria-pressed="selectedEffectId === effect.id"
        @click="emit('select', effect.id)"
      >
        <LayerThumbnail :value="thumbnails?.[effectThumbnailId(layer.id, effect.id)]" />
        <component :is="effect.kind === 'gradient' ? Sparkles : Palette" :size="12" aria-hidden="true" />
        <span
          >{{ effect.kind === 'gradient' ? t('title') : colorText('title') }}
          <template v-if="layer.effects.length > 1">{{ index + 1 }}</template></span
        >
      </button>
      <Tooltip
        :content="effectText(disabled ? 'busy' : 'locked')"
        :disabled="!disabled && !layer.locked"
        :delay="200"
        :tabindex="disabled || layer.locked ? 0 : undefined"
      >
        <Button
          size="xs"
          icon-only
          variant="ghost"
          :icon="effect.enabled ? Eye : EyeOff"
          :disabled="disabled || layer.locked"
          :aria-label="t(effect.enabled ? 'disable' : 'enable')"
          @click="emit('toggle', effect.id)"
        />
      </Tooltip>
    </div>
  </div>
</template>
<style scoped>
.layer-effect-list {
  width: calc(100% - 22px);
  display: grid;
  gap: 2px;
  padding-left: 8px;
  border-left: 1px solid var(--color-border);
  margin: 0 4px 0 18px;
}
.effect-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
}
.effect-select {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  height: 36px;
  padding: 0 4px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  text-align: left;
  cursor: pointer;
}
.effect-select span {
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.effect-select.selected {
  background: var(--color-bg-field-active);
  border-color: var(--color-border-strong);
  color: var(--text-primary);
}
.effect-select:hover:not(:disabled) {
  background: var(--color-bg-surface-hover);
}
.effect-select.inactive {
  opacity: 0.45;
}
.effect-select:focus-visible {
  outline: 1px solid var(--text-secondary);
  outline-offset: -1px;
}
</style>
