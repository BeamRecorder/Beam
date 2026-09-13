<script setup lang="ts">
import { computed } from 'vue';
import {
  AudioLines,
  ArrowRight,
  CircleDashed,
  Focus,
  Image as ImageIcon,
  Mic2,
  Palette,
  Pencil,
  Plus,
  Shapes,
  Type,
  Video,
  Volume2,
} from '@lucide/vue';
import PopoverMenuButton, { type PopoverMenuItem } from '~/ui/popover/PopoverMenuButton.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { TimelineElementKind } from './timeline-element-types';

const emit = defineEmits<{ (event: 'add:element', kind: TimelineElementKind): void }>();
const { t } = useTranslate('TimelineToolbar');
const { t: tHighlight } = useTranslate('Highlight');
const { t: tCanvas } = useTranslate('CanvasPanel');
const { t: tSidebar } = useTranslate('SidebarPanel');
const { t: tElements } = useTranslate('Elements');

const items = computed<readonly PopoverMenuItem[]>(() => [
  { id: 'video', label: t('video'), icon: Video },
  {
    id: 'elements',
    label: tElements('title'),
    icon: Shapes,
    children: [
      { id: 'shape', label: tElements('shape'), icon: Shapes },
      { id: 'arrow', label: tElements('arrow'), icon: ArrowRight },
      { id: 'text', label: tElements('text'), icon: Type },
      { id: 'drawing', label: tElements('drawing'), icon: Pencil },
      { id: 'highlight', label: tHighlight('title'), icon: Focus },
      { id: 'blur', label: t('blur'), icon: CircleDashed },
      { id: 'color', label: tCanvas('color'), icon: Palette },
      { id: 'image', label: tElements('image'), icon: ImageIcon },
    ],
  },
  {
    id: 'audio',
    label: tSidebar('audio'),
    icon: AudioLines,
    children: [
      { id: 'sound', label: t('sound'), icon: Volume2 },
      { id: 'voiceover', label: t('voiceover'), icon: Mic2 },
    ],
  },
]);
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
