<script setup lang="ts">
import { computed } from 'vue';
import { Sparkles, Palette, Contrast } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Popover from '~/ui/popover/Popover.vue';
import PopoverMenuList from '~/ui/popover/PopoverMenuList.vue';
import Tooltip from '~/ui/tooltip/Tooltip.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { LayerEffectAddKind } from '@beam/engine/gradient/color-effect-types';
import type { LayerEffectToolbarProps } from './gradient-panel-types';
const props = defineProps<LayerEffectToolbarProps>();
const emit = defineEmits<{ add: [kind: LayerEffectAddKind] }>();
const { t } = useTranslate('LayerEffects');
const { t: gradientText } = useTranslate('GradientEffect');
const { t: colorText } = useTranslate('ColorEffect');
const menus = computed(() => [
  {
    id: 'effects',
    label: t('effects'),
    icon: Sparkles,
    items: [{ id: 'gradient', label: gradientText('title'), icon: Sparkles }],
  },
  {
    id: 'color',
    label: t('color'),
    icon: Palette,
    items: [
      { id: 'color-adjustment', label: colorText('title'), icon: Palette },
      { id: 'grayscale', label: colorText('monochrome'), icon: Contrast },
    ],
  },
]);
const select = (id: string, close: () => void) => {
  if (!props.disabled) emit('add', id as LayerEffectAddKind);
  close();
};
</script>
<template>
  <div class="effect-toolbar" role="toolbar" :aria-label="t('title')">
    <Popover
      v-for="menu in menus"
      :key="menu.id"
      flush
      :disabled="disabled"
      align="left"
      :direction="direction"
      :match-trigger-width="false"
    >
      <template #trigger="{ isOpen }">
        <Tooltip
          :content="disabled ? t(disabledReason ?? 'selectElement') : menu.label"
          :delay="200"
          :tabindex="disabled ? 0 : undefined"
          :aria-label="disabled ? t(disabledReason ?? 'selectElement') : undefined"
        >
          <Button
            variant="ghost"
            size="xs"
            icon-only
            :icon="menu.icon"
            :disabled="disabled"
            :aria-label="menu.label"
            :data-effect-menu="menu.id"
            aria-haspopup="menu"
            :aria-expanded="isOpen"
          />
        </Tooltip>
      </template>
      <template #default="{ close }"
        ><PopoverMenuList :items="menu.items" @select="select($event, close)" @dismiss="close"
      /></template>
    </Popover>
    <slot />
  </div>
</template>
<style scoped>
.effect-toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 10px 6px;
}
</style>
