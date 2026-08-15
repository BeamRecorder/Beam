<script setup lang="ts">
import { computed, toRef } from 'vue';
import Input from '~/ui/input/Input.vue';
import Divider from '~/ui/divider/Divider.vue';
import DeleteItem from '~/ui/button/DeleteItem.vue';
import type { CaptionClip, CaptionStyle, CaptionWord } from '~/media/shared/composition-types';
import { useCaptionDraft } from './useCaptionDraft';
import { useTranslate } from '~/i18n/useTranslate';
import { createDefaultCaptionStyle } from '~/media/shared/composition-defaults';
import CaptionStyleControls from './CaptionStyleControls.vue';

const { t } = useTranslate('CaptionClipPanel');
const props = defineProps<{ clip: CaptionClip | null }>();
const emit = defineEmits<{
  (event: 'update', clip: CaptionClip): void;
  (event: 'delete', clipId: string): void;
}>();

const { draft, flush, update } = useCaptionDraft(toRef(props, 'clip'), (clip) => emit('update', clip));
const captionStyle = computed<CaptionStyle>(() => ({
  ...createDefaultCaptionStyle(36),
  shadowDirection: 'bottom-right',
  ...draft.value?.caption.style,
}));
const sentences = computed(() => (draft.value?.caption.type === 'text' ? draft.value.caption.sentences : []));
const displayText = computed(
  () => captionStyle.value.customText || sentences.value.map((sentence) => sentence.text).join(' '),
);

const updateStyle = (key: keyof CaptionStyle, value: CaptionStyle[keyof CaptionStyle]) =>
  update((clip) => ({
    ...clip,
    caption: { ...clip.caption, style: { ...clip.caption.style, [key]: value } },
  }));

const updateWord = (sentenceId: string, index: number, key: keyof CaptionWord, value: string) => {
  const parsed = key === 'text' ? value : Number(value);
  if (key !== 'text' && (!Number.isFinite(parsed) || Number(parsed) < 0)) return;
  update((clip) => {
    if (clip.caption.type !== 'text') return clip;
    const sentences = clip.caption.sentences.map((sentence) => {
      if (sentence.id !== sentenceId) return sentence;
      const words = sentence.words.map((word, wordIndex) => (wordIndex === index ? { ...word, [key]: parsed } : word));
      return {
        ...sentence,
        words,
        text: words.map((word) => word.text).join(' '),
        startMs: words[0]?.startMs ?? sentence.startMs,
        endMs: words.at(-1)?.endMs ?? sentence.endMs,
      };
    });
    const startMs = sentences[0]?.startMs ?? clip.sourceInMs;
    const endMs = sentences.at(-1)?.endMs ?? startMs + clip.sourceDurationMs;
    const durationMs = Math.max(40, endMs - startMs);
    return {
      ...clip,
      timelineDurationMs: durationMs / clip.playbackRate,
      sourceInMs: startMs,
      sourceDurationMs: durationMs,
      caption: { ...clip.caption, sentences },
    };
  });
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
            @update:model-value="updateStyle('customText', String($event))"
            @blur="flush"
          />
          <p class="section-desc">{{ t('customTextDescription') }}</p>
        </div>
      </div>

      <Divider spacing="xs" />
      <CaptionStyleControls :style="captionStyle" :default-font-size="36" @update="updateStyle" />

      <Divider v-if="sentences.length" spacing="xs" />
      <div v-if="sentences.length" class="section-block">
        <span class="section-title">{{ t('wordTimings') }}</span>
        <p class="section-desc">{{ t('wordTimingsDescription') }}</p>
        <div class="word-labels" aria-hidden="true">
          <span>{{ t('word') }}</span
          ><span>{{ t('in') }}</span
          ><span>{{ t('out') }}</span>
        </div>
        <div v-for="sentence in sentences" :key="sentence.id" class="sentence-box">
          <p class="sentence-text">{{ sentence.text }}</p>
          <div v-for="(word, index) in sentence.words" :key="`${sentence.id}-${index}`" class="word-row">
            <Input
              :model-value="word.text"
              size="sm"
              :aria-label="t('captionWordLabel')"
              @update:model-value="updateWord(sentence.id, index, 'text', String($event))"
              @blur="flush"
            />
            <Input
              :model-value="word.startMs"
              type="number"
              size="sm"
              :min="0"
              :aria-label="t('wordStartTimeLabel')"
              @update:model-value="updateWord(sentence.id, index, 'startMs', String($event))"
              @blur="flush"
            />
            <Input
              :model-value="word.endMs"
              type="number"
              size="sm"
              :min="0"
              :aria-label="t('wordEndTimeLabel')"
              @update:model-value="updateWord(sentence.id, index, 'endMs', String($event))"
              @blur="flush"
            />
          </div>
        </div>
      </div>

      <div class="danger-zone">
        <DeleteItem :label="t('deleteCaptionClip')" @click="emit('delete', draft.id)" />
      </div>
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
.sub-group,
.sentence-box {
  display: flex;
  flex-direction: column;
}
.section-block {
  gap: 10px;
}
.sub-group,
.sentence-box {
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
.sub-label,
.word-labels {
  font-size: 10px;
  font-weight: 500;
  color: var(--text-muted);
}
.word-labels,
.word-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 62px 62px;
  gap: 6px;
}
.word-labels span:not(:first-child) {
  text-align: center;
}
.sentence-text {
  margin: 0;
  color: var(--text-primary);
  font-size: 11px;
  font-weight: 600;
}
.danger-zone {
  margin-top: auto;
  position: sticky;
  bottom: 0;
  padding-top: 14px;
  padding-bottom: 2px;
  background: var(--color-bg-element);
  z-index: 10;
  width: 100%;
  box-shadow: 0 -8px 16px var(--color-bg-element);
}
</style>
