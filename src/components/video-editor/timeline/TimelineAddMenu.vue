<script setup lang="ts">
import { computed } from 'vue';
import { CircleDashed, Image as ImageIcon, Mic2, Palette, Plus, Shapes, Type, Video, Volume2 } from '@lucide/vue';
import PopoverMenuButton from '~/ui/popover/PopoverMenuButton.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { TimelineElementKind } from './timeline-element-types';

const emit = defineEmits<{ (event: 'add:element', kind: TimelineElementKind): void }>();
const { t } = useTranslate('TimelineToolbar');
const { t: tCanvas } = useTranslate('CanvasPanel');

const items = computed(
  () =>
    [
      { id: 'video', label: t('video'), icon: Video },
      { id: 'image', label: t('image'), icon: ImageIcon },
      { id: 'color', label: tCanvas('color'), icon: Palette },
      { id: 'shape', label: tCanvas('shapesAndArrows'), icon: Shapes },
      { id: 'sound', label: t('sound'), icon: Volume2 },
      { id: 'voiceover', label: t('voiceover'), icon: Mic2 },
      { id: 'caption', label: t('text'), icon: Type },
      { id: 'blur', label: t('blur'), icon: CircleDashed },
    ] as const,
);
</script>

<template>
  <PopoverMenuButton
    bare
    block
    direction="up"
    :label="t('add')"
    :aria-label="t('add')"
    :icon="Plus"
    :items="items"
    @select="emit('add:element', $event as TimelineElementKind)"
  />
</template>
