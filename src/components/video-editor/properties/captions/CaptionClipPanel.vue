<script setup lang="ts">
import { computed, toRef } from 'vue';
import { TriangleAlert } from '@lucide/vue';
import Input from '~/ui/input/Input.vue';
import Divider from '~/ui/divider/Divider.vue';
import type { CaptionClip, CaptionStyle } from '~/media/shared/composition-types';
import { useCaptionDraft } from './useCaptionDraft';
import { useTranslate } from '~/i18n/useTranslate';
import { createDefaultCaptionStyle } from '~/media/shared/composition-defaults';
import CaptionStyleControls from './CaptionStyleControls.vue';

const { t } = useTranslate('CaptionClipPanel');
const props = defineProps<{ clip: CaptionClip | null }>();
const emit = defineEmits<{
  (event: 'update', clip: CaptionClip): void;
  (event: 'delete', clipId: string): void;
  (event: 'preview', clip: CaptionClip | null): void;
}>();

const { draft, update } = useCaptionDraft(toRef(props, 'clip'), (clip) => emit('update', clip));
const captionStyle = computed<CaptionStyle>(() => ({
  ...createDefaultCaptionStyle(36),
  shadowDirection: 'bottom-right',
  ...draft.value?.caption.style,
}));
const sentences = computed(() => (draft.value?.caption.type === 'text' ? draft.value.caption.sentences : []));
const displayText = computed(
  () => captionStyle.value.customText ?? sentences.value.map((sentence) => sentence.text).join(' '),
);

const updateStyle = (key: keyof CaptionStyle, value: CaptionStyle[keyof CaptionStyle]) =>
  update((clip) => ({
    ...clip,
    caption: { ...clip.caption, style: { ...clip.caption.style, [key]: value } },
  }));
const previewStyle = (patch: Partial<CaptionStyle> | null) => {
  if (!draft.value) return;
  emit(
    'preview',
    patch ? { ...draft.value, caption: { ...draft.value.caption, style: { ...captionStyle.value, ...patch } } } : null,
  );
};
</script>

<template>
  <div v-if="draft" class="caption-clip-panel">
    <div class="options-group">
      <div class="section-block">
        <span class="section-title">{{ t('displayText') }}</span>
        <div class="sub-group">
          <span class="sub-label">{{ t('captionText') }}</span>
          <Input
            :model-value="displayText"
            :placeholder="t('typeCustomText')"
            size="md"
            :debounce="150"
            @update:model-value="updateStyle('customText', String($event))"
          />
          <div v-if="draft.isAiGenerated" class="ai-edit-warning" role="status" aria-live="polite">
            <TriangleAlert :size="14" aria-hidden="true" />
            <span>{{ t('aiTimingEditWarning') }}</span>
          </div>
          <p class="section-desc">{{ t('customTextDescription') }}</p>
        </div>
      </div>

      <Divider spacing="xs" />
      <CaptionStyleControls
        :style="captionStyle"
        :default-font-size="36"
        :sample-text="displayText"
        :show-word-highlight="draft.isAiGenerated === true"
        :word-highlight-available="sentences.some((sentence) => sentence.words.length > 0)"
        @update="updateStyle"
        @preview="previewStyle"
      />
    </div>
  </div>
</template>

<style scoped>
.caption-clip-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 100%;
}
.options-group {
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
}
.section-block,
.sub-group {
  display: flex;
  flex-direction: column;
}
.section-block {
  gap: 10px;
}
.sub-group {
  gap: 6px;
  width: 100%;
}
.section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}
.section-desc {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.4;
  margin: 0;
}
.ai-edit-warning {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 7px 8px;
  border: 1px solid color-mix(in srgb, var(--color-warning) 38%, var(--color-border));
  border-radius: var(--radius-md);
  background: var(--color-warning-light);
  color: var(--text-secondary);
  font-size: 10px;
  line-height: 1.4;
}
.ai-edit-warning svg {
  flex: 0 0 auto;
  color: var(--color-warning);
}
.sub-label {
  font-size: 10px;
  font-weight: 500;
  color: var(--text-muted);
}
.danger-zone {
  margin-top: auto;
  padding-top: 16px;
  width: 100%;
}
</style>
