<script setup lang="ts">
import type { VNodeRef } from 'vue';
import { computed } from 'vue';
import { ScrollText, X } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Textarea from '~/ui/textarea/Textarea.vue';
import TeleprompterToolbar from './TeleprompterToolbar.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { splitTeleprompterLines } from './teleprompter-types';
import type { TeleprompterViewProps, TeleprompterDocument } from './teleprompter-types';

const props = defineProps<TeleprompterViewProps>();
const emit = defineEmits<{
  close: [];
  update: [patch: Partial<TeleprompterDocument>];
  reset: [];
  edit: [];
  play: [];
  display: [element: HTMLElement | null];
}>();
const { t } = useTranslate('Teleprompter');
const lines = computed(() => splitTeleprompterLines(props.document.text));
const setDisplayElement: VNodeRef = (element) => {
  emit('display', element instanceof HTMLElement ? element : null);
};
</script>

<template>
  <main
    class="teleprompter-window"
    :style="{
      '--teleprompter-font-size': document.fontSize + 'px',
      '--teleprompter-line-height': document.lineHeight,
      '--teleprompter-text': document.textColor ?? 'var(--text-primary)',
    }"
  >
    <header class="teleprompter-header">
      <div class="teleprompter-title">
        <ScrollText :size="14" aria-hidden="true" />
        <h1>{{ t('title') }}</h1>
      </div>
      <div class="teleprompter-close">
        <Button
          variant="ghost"
          size="xs"
          icon-only
          :icon="X"
          :aria-label="t('close')"
          :tooltip="t('close')"
          tooltip-position="bottom"
          @click="$emit('close')"
        />
      </div>
    </header>
    <section class="reader-view">
      <p v-if="error" class="teleprompter-error" role="alert">
        {{ error }}
      </p>
      <Textarea
        v-if="editing"
        class="teleprompter-editor"
        :model-value="document.text"
        :placeholder="t('placeholder')"
        :aria-label="t('editorLabel')"
        @update:model-value="$emit('update', { text: $event })"
      />
      <section
        v-show="!editing"
        :ref="setDisplayElement"
        class="teleprompter-display"
        :class="{ 'is-centered': document.textAlign === 'center' }"
        :aria-label="t('readerLabel')"
      >
        <p
          v-for="(line, index) in lines"
          :key="index + '-' + line"
          :data-line-index="index"
          class="teleprompter-line"
          :class="{
            active: document.mode === 'line-by-line' && activeLine === index,
            past: document.mode === 'line-by-line' && index < activeLine,
          }"
        >
          {{ line || '\u00a0' }}
        </p>
      </section>
    </section>
    <TeleprompterToolbar
      :document="document"
      :default-text-color="defaultTextColor"
      :editing="editing"
      :playing="playing"
      @update="$emit('update', $event)"
      @reset="$emit('reset')"
      @edit="$emit('edit')"
      @play="$emit('play')"
    />
    <slot />
  </main>
</template>
<style scoped src="./Teleprompter.css"></style>
