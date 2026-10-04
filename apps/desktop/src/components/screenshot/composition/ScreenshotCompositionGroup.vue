<script setup lang="ts">
import { ref, useId } from 'vue';
import { ChevronDown, ChevronRight } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Badge from '~/ui/badge/Badge.vue';
import RafRevealTransition from '~/ui/transitions/RafRevealTransition.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { ScreenshotCompositionGroupProps } from './screenshot-composition-group-types';
import ScreenshotCompositionLabel from './ScreenshotCompositionLabel.vue';
defineProps<ScreenshotCompositionGroupProps>();
const emit = defineEmits<{ select: [event: MouseEvent] }>();
const { t } = useTranslate('ScreenshotComposition');
const open = ref(true),
  contentId = `screenshot-group-${useId()}`;
</script>
<template>
  <div
    class="composition-group"
    :class="{ 'root-drop-before': rootInsertion === 'before', 'root-drop-after': rootInsertion === 'after' }"
    :data-composition-group="groupId"
    :data-composition-block="blockKey"
  >
    <div
      v-if="groupId"
      class="group-heading"
      :class="{ selected, 'drop-target': dropTarget }"
      :data-group-drop="groupId"
    >
      <Button
        variant="ghost"
        size="xs"
        icon-only
        :icon="open ? ChevronDown : ChevronRight"
        :disabled="disabled"
        :aria-expanded="open"
        :aria-controls="contentId"
        :aria-label="t(open ? 'collapseGroup' : 'expandGroup', { name })"
        :tooltip="t(open ? 'collapseGroup' : 'expandGroup', { name })"
        @click="open = !open"
      />
      <div class="group-select-control">
        <Button
          block
          variant="ghost"
          size="xs"
          content-layout="custom"
          :style="{ minWidth: '0', padding: '0 6px' }"
          class="group-select"
          :disabled="disabled"
          :aria-pressed="selected"
          :aria-label="t('selectGroup', { name })"
          @click="emit('select', $event)"
        >
          <ScreenshotCompositionLabel :text="name" /><Badge class="member-count" variant="outline">{{ count }}</Badge>
        </Button>
      </div>
    </div>
    <RafRevealTransition>
      <div
        v-show="!groupId || open"
        :id="contentId"
        class="group-members"
        :class="{ grouped: groupId }"
        :inert="(groupId && !open) || undefined"
      >
        <slot />
      </div>
    </RafRevealTransition>
  </div>
</template>
<style scoped>
.composition-group {
  position: relative;
  min-width: 0;
}
.composition-group.root-drop-before::before,
.composition-group.root-drop-after::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  border-radius: var(--radius-sm);
  background: var(--text-primary);
  pointer-events: none;
}
.composition-group.root-drop-before::before {
  top: -4px;
}
.composition-group.root-drop-after::after {
  bottom: -4px;
}
.group-heading {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 2px 4px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
}
.group-heading.selected {
  background: var(--color-bg-field-active);
}
.group-heading.drop-target {
  border-color: var(--text-primary);
  background: var(--color-bg-field-active);
}
.group-select {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.group-select-control {
  flex: 1;
  min-width: 0;
  height: 28px;
}
.member-count {
  flex-shrink: 0;
}
.group-members {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.group-members.grouped {
  margin-left: 15px;
  padding-left: 6px;
  border-left: 1px solid var(--color-border);
}
</style>
