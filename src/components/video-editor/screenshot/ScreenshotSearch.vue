<script setup lang="ts">
import { inject, onBeforeUnmount } from 'vue';
import { Copy, Crop, Download, Maximize2, RotateCcw, SlidersHorizontal, Paintbrush } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import EditorSpotlight from '../search/EditorSpotlight.vue';
import { editorSearchKey } from '../search/editor-search-types';
import { focusEditorProperty } from '../search/focus-editor-property';
import type { ScreenshotSearchProps } from './screenshot-search-types';

const props = defineProps<ScreenshotSearchProps>();
const emit = defineEmits<{ copy: []; export: []; crop: []; recenter: []; fullscreen: []; dimensions: [] }>();
const search = inject(editorSearchKey)!;
const { t } = useI18n();
const release = search.registerActions(() => [
  {
    id: 'action:copy',
    group: 'action',
    label: t('ScreenshotEditor.copy'),
    icon: Copy,
    terms: ['copy', 'clipboard'],
    disabled: props.disabled,
    run: () => emit('copy'),
  },
  {
    id: 'action:export',
    group: 'action',
    label: t('ScreenshotEditor.exportImage'),
    icon: Download,
    terms: ['export', 'save', 'png', 'webp'],
    disabled: props.disabled,
    run: () => emit('export'),
  },
  {
    id: 'action:crop',
    group: 'action',
    label: t('ScreenshotEditor.crop'),
    icon: Crop,
    terms: ['crop'],
    disabled: props.disabled || !props.canCrop,
    run: () => emit('crop'),
  },
  {
    id: 'action:recenter',
    group: 'action',
    label: t('EditorCanvas.recenter'),
    icon: RotateCcw,
    terms: ['recenter', 'reset', 'zoom', 'pan'],
    disabled: props.disabled,
    run: () => emit('recenter'),
  },
  {
    id: 'action:fullscreen',
    group: 'action',
    label: t('TimelineToolbar.fullscreenPreview'),
    icon: Maximize2,
    terms: ['fullscreen', 'preview'],
    disabled: props.disabled || !props.canFullscreen,
    run: () => emit('fullscreen'),
  },
  {
    id: 'setting:dimensions',
    group: 'setting',
    label: t('ScreenshotEditor.dimensions'),
    detail: t('ScreenshotEditor.canvas'),
    icon: SlidersHorizontal,
    terms: ['size', 'width', 'height', 'resolution', 'dimensions'],
    disabled: props.disabled,
    run: () => emit('dimensions'),
  },
  {
    id: 'setting:background-visibility',
    group: 'setting',
    label: t('ScreenshotComposition.show', { name: t('ScreenshotComposition.background') }),
    detail: t('ScreenshotEditor.canvas'),
    icon: Paintbrush,
    terms: ['background', 'transparency'],
    disabled: props.disabled,
    run: async () => {
      await search.navigate('canvas');
      if (
        !(await focusEditorProperty(t('ScreenshotComposition.show', { name: t('ScreenshotComposition.background') })))
      )
        throw new Error(t('EditorSearch.unavailable'));
    },
  },
]);
onBeforeUnmount(release);
</script>

<template><EditorSpotlight :navigate="navigate" /></template>
