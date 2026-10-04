<script setup lang="ts">
import Button from '~/ui/button/Button.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { ProjectTitleProps } from './project-picker-types';

defineProps<ProjectTitleProps>();
const emit = defineEmits<{ rename: [] }>();
const { t } = useTranslate('ProjectPicker');
</script>

<template>
  <span v-if="selectionMode" class="project-card-name" :title="project.name">{{ project.name }}</span>
  <div v-else class="project-name-control">
    <Button
      variant="ghost"
      size="xs"
      block
      align="start"
      class="project-card-name"
      :style="{
        height: '18px',
        padding: '0',
        border: '0',
        background: 'transparent',
        fontSize: '11px',
        fontWeight: '700',
        lineHeight: '1.2',
      }"
      :title="project.name"
      :aria-label="`${t('rename')}: ${project.name}`"
      @click.stop="emit('rename')"
      @dblclick.stop
      @keydown.enter.stop
      @keydown.space.stop
      >{{ project.name }}</Button
    >
  </div>
</template>

<style scoped>
.project-name-control {
  flex: 1;
  min-width: 0;
}
.project-card-name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.2;
}
</style>
