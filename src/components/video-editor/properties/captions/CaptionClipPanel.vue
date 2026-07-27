<script setup lang="ts">
import { computed, toRef } from "vue";
import ColorPicker from "~/ui/ColorPicker/ColorPicker.vue";
import Input from "~/ui/input/Input.vue";
import BigSlider from "~/ui/slider/BigSlider.vue";
import Select from "~/ui/select/Select.vue";
import Button from "~/ui/button/Button.vue";
import { Box, Moon, Sparkles, Trash2, Type } from "@lucide/vue";
import type {
  CaptionCompositionLayer,
  CaptionStyle,
  CaptionWord,
} from "../../composition/composition-types";
import { useCaptionDraft } from "./useCaptionDraft";
import { useTranslate } from "~/i18n/useTranslate";

const { t } = useTranslate("CaptionClipPanel");

const props = defineProps<{ layer: CaptionCompositionLayer | null }>();
const emit = defineEmits<{
  (event: "update", layer: CaptionCompositionLayer): void;
  (event: "delete", layerId: string): void;
}>();

const { draft, flush, update } = useCaptionDraft(
  toRef(props, "layer"),
  (layer) => emit("update", layer),
);

const captionStyle = computed<CaptionStyle>(() => ({
  color: "#ffffff",
  fontSize: 36,
  shadowColor: "rgba(0, 0, 0, 0.85)",
  shadowBlur: 0,
  shadowDirection: "bottom-right",
  placement: "bottom",
  boxColor: "#000000",
  boxPadding: 6,
  boxRadius: 4,
  ...draft.value?.caption.style,
}));
const sentences = computed(() => draft.value?.caption.sentences ?? []);
const displayText = computed(() =>
  captionStyle.value.customText || sentences.value.map((sentence) => sentence.text).join(" "),
);

const updateStyle = (
  key: keyof CaptionStyle,
  value: CaptionStyle[keyof CaptionStyle],
) => update((layer) => ({
  ...layer,
  caption: {
    ...layer.caption,
    style: { ...layer.caption.style, [key]: value },
  },
}));

const updateWord = (
  sentenceId: string,
  index: number,
  key: keyof CaptionWord,
  value: string,
) => {
  const parsedValue = key === "text" ? value : Number(value);
  if (key !== "text" && (!Number.isFinite(parsedValue) || parsedValue < 0)) return;

  update((layer) => {
    const sentences = layer.caption.sentences.map((sentence) => {
      if (sentence.id !== sentenceId) return sentence;
      const words = sentence.words.map((word, wordIndex) =>
        wordIndex === index ? { ...word, [key]: parsedValue } : word,
      );
      return {
        ...sentence,
        words,
        text: words.map((word) => word.text).join(" "),
        startMs: words[0]?.startMs ?? sentence.startMs,
        endMs: words.at(-1)?.endMs ?? sentence.endMs,
      };
    });
    return {
      ...layer,
      startMs: sentences[0]?.startMs ?? layer.startMs,
      endMs: sentences.at(-1)?.endMs ?? layer.endMs,
      caption: { ...layer.caption, sentences },
    };
  });
};

const shadowDirectionOptions = computed(() => [
  { value: "all", label: t("shadowAllAround") },
  { value: "bottom", label: t("shadowBottom") },
  { value: "bottom-right", label: t("shadowBottomRight") },
  { value: "top-left", label: t("shadowTopLeft") },
]);
</script>

<template>
  <div v-if="draft" class="caption-clip-panel">
    <div v-if="draft.isAiGenerated" class="ai-badge-header">
      <Sparkles :size="14" class="ai-badge-icon" />
      <span>{{ t('generatedByAI') }}</span>
    </div>

    <section class="panel-group">
      <h4 class="group-title"><Type :size="14" /> {{ t('displayText') }}</h4>
      <div class="field-group">
        <label class="field-label">{{ t('captionText') }}</label>
        <Input
          :model-value="displayText"
          :placeholder="t('typeCustomText')"
          size="md"
          @update:model-value="updateStyle('customText', String($event))"
          @blur="flush"
        />
        <p class="field-description">{{ t('customTextDescription') }}</p>
      </div>
    </section>

    <section class="panel-group">
      <h4 class="group-title"><Type :size="14" /> {{ t('typography') }}</h4>
      <div class="field-grid-2">
        <div class="field-group">
          <label class="field-label">{{ t('textColor') }}</label>
          <ColorPicker :model-value="captionStyle.color" @update:model-value="updateStyle('color', $event)" />
        </div>
      </div>
      <BigSlider :label="t('fontSize')" :model-value="captionStyle.fontSize" :min="12" :max="120" :step="1" :default-value="36" :format-value="(value) => `${value}px`" @update:model-value="updateStyle('fontSize', $event)" />
    </section>

    <section class="panel-group">
      <h4 class="group-title"><Box :size="14" /> {{ t('outlineExtrusion') }}</h4>
      <div class="field-grid-2">
        <div class="field-group">
          <label class="field-label">{{ t('outlineColor') }}</label>
          <ColorPicker :model-value="captionStyle.boxColor ?? '#000000'" @update:model-value="updateStyle('boxColor', $event)" />
        </div>
      </div>
      <BigSlider :label="t('outlineThickness')" :model-value="captionStyle.boxPadding ?? 6" :min="0" :max="30" :step="1" :default-value="6" :format-value="(value) => `${value}px`" @update:model-value="updateStyle('boxPadding', $event)" />
      <BigSlider :label="t('extrusionDepth')" :model-value="captionStyle.boxRadius ?? 4" :min="0" :max="20" :step="1" :default-value="4" :format-value="(value) => `${value}px`" @update:model-value="updateStyle('boxRadius', $event)" />
    </section>

    <section class="panel-group">
      <h4 class="group-title"><Moon :size="14" /> {{ t('textShadow') }}</h4>
      <div class="field-grid-2">
        <div class="field-group">
          <label class="field-label">{{ t('shadowColor') }}</label>
          <ColorPicker :model-value="captionStyle.shadowColor" @update:model-value="updateStyle('shadowColor', $event)" />
        </div>
        <div class="field-group">
          <label class="field-label">{{ t('direction') }}</label>
          <Select :items="shadowDirectionOptions" :model-value="captionStyle.shadowDirection ?? 'bottom-right'" size="sm" @update:model-value="updateStyle('shadowDirection', $event as CaptionStyle['shadowDirection'])" />
        </div>
      </div>
      <BigSlider :label="t('shadowBlur')" :model-value="captionStyle.shadowBlur" :min="0" :max="50" :step="1" :default-value="0" :format-value="(value) => `${value}px`" @update:model-value="updateStyle('shadowBlur', $event)" />
    </section>

    <section v-if="sentences.length" class="panel-group timing-group">
      <div>
        <h4 class="group-title">{{ t('wordTimings') }}</h4>
        <p class="group-description">{{ t('wordTimingsDescription') }}</p>
      </div>
      <div class="word-labels" aria-hidden="true"><span>{{ t('word') }}</span><span>{{ t('in') }}</span><span>{{ t('out') }}</span></div>
      <div v-for="sentence in sentences" :key="sentence.id" class="sentence-box">
        <p class="sentence-text">{{ sentence.text }}</p>
        <div v-for="(word, index) in sentence.words" :key="`${sentence.id}-${index}`" class="word-row">
          <Input :model-value="word.text" size="sm" :aria-label="t('captionWordLabel')" @update:model-value="updateWord(sentence.id, index, 'text', String($event))" @blur="flush" />
          <Input :model-value="word.startMs" type="number" size="sm" min="0" :aria-label="t('wordStartTimeLabel')" @update:model-value="updateWord(sentence.id, index, 'startMs', String($event))" @blur="flush" />
          <Input :model-value="word.endMs" type="number" size="sm" min="0" :aria-label="t('wordEndTimeLabel')" @update:model-value="updateWord(sentence.id, index, 'endMs', String($event))" @blur="flush" />
        </div>
      </div>
    </section>

    <div class="danger-zone">
      <Button variant="danger" size="sm" block :icon="Trash2" @click="emit('delete', draft.id)">{{ t('deleteCaptionClip') }}</Button>
    </div>
  </div>
</template>

<style scoped>
.caption-clip-panel { display: flex; flex: 1; min-height: 100%; flex-direction: column; gap: 14px; padding-bottom: 8px; }
.ai-badge-header { display: flex; align-items: center; gap: 6px; border: 1px solid rgba(99, 102, 241, .25); border-radius: var(--radius-sm); background: rgba(99, 102, 241, .12); color: var(--color-primary); padding: 7px 10px; font-size: 11px; font-weight: 700; }
.ai-badge-icon { color: var(--color-primary); }
.panel-group { display: flex; flex-direction: column; gap: 10px; border-bottom: 1px solid var(--color-border); padding-bottom: 14px; }
.group-title { display: flex; align-items: center; gap: 6px; margin: 0; color: var(--text-primary); font-size: 12px; font-weight: 700; }
.group-description { margin: 3px 0 0; color: var(--text-muted); font-size: 11px; line-height: 1.35; }
.field-group { display: flex; flex-direction: column; gap: 5px; }
.field-grid-2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px; align-items: end; }
.field-label, .word-labels { color: var(--text-secondary); font-size: 10px; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; }
.field-description { margin: 0; color: var(--text-muted); font-size: 10px; line-height: 1.35; }
.timing-group { gap: 8px; }
.word-labels, .word-row { display: grid; grid-template-columns: minmax(0, 1fr) 62px 62px; gap: 6px; }
.word-labels span:not(:first-child) { text-align: center; }
.sentence-box { display: flex; flex-direction: column; gap: 5px; }
.sentence-text { margin: 0; color: var(--text-primary); font-size: 11px; font-weight: 700; }
.danger-zone { position: sticky; bottom: 0; z-index: 1; margin-top: auto; padding-top: 6px; background: var(--color-bg-element); }
</style>
