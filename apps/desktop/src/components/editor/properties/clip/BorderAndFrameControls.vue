<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import ColorPicker from '~/ui/ColorPicker/ColorPicker.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import Switch from '~/ui/switch/Switch.vue';
import Input from '~/ui/input/Input.vue';
import Accordion from '~/ui/accordion/Accordion.vue';
import Select from '~/ui/select/Select.vue';
import { DEFAULT_ANIMATED_FRAME, type AnimatedFrameSettings } from '@beam/engine/shared/animated-frame-types';
import { ANIMATED_FRAME_PRESETS } from '@beam/engine/shared/animated-frame-schema';
import { FRAME_MODELS, frameOptions, animatedFrameOptions } from './frame-options';
import type { BorderAndFrameSettings } from './border-and-frame-types';
import type { ClipFrame } from '@beam/engine/shared/composition-types';
import { useTranslate } from '~/i18n/useTranslate';
import { isPhoneFrame } from '@beam/engine/shared/phone-frame-types';
import PhoneFrameFillControls from './PhoneFrameFillControls.vue';

const { t } = useTranslate('BorderAndFrameControls');

const props = defineProps<BorderAndFrameSettings>();
const emit = defineEmits<{ (event: 'update', value: BorderAndFrameSettings): void }>();
const sections = ref({ border: false, frame: false });
const activeFrame = computed(() => props.frame ?? 'none');
const frameEnabled = computed(() => activeFrame.value !== 'none');
const phoneFrame = computed(() => isPhoneFrame(activeFrame.value));
const animated = computed(() => activeFrame.value === 'animated');
const animatedSettings = computed(() => props.animatedFrame ?? DEFAULT_ANIMATED_FRAME);
const lastEnabledFrame = ref<Exclude<ClipFrame, 'none'>>(activeFrame.value === 'none' ? 'safari' : activeFrame.value);
watch(activeFrame, (frame) => {
  if (frame !== 'none') lastEnabledFrame.value = frame;
});
const models = computed(() => frameOptions(t('animatedBorder')));
const presets = computed(() => animatedFrameOptions((key) => t(`presets.${key}`)));
const toggleFrame = (enabled: boolean) => emit('update', { frame: enabled ? lastEnabledFrame.value : 'none' });
const selectFrame = (value: string | number) => {
  const frame = FRAME_MODELS.find((model) => model === value);
  if (frame) emit('update', { frame });
};
const updateAnimated = (patch: Partial<AnimatedFrameSettings>) =>
  emit('update', { animatedFrame: { ...animatedSettings.value, ...patch } });
const selectPreset = (value: string | number) => {
  const preset = ANIMATED_FRAME_PRESETS.find((item) => item === value);
  if (preset) updateAnimated({ preset });
};
</script>

<template>
  <div class="appearance-controls">
    <Accordion v-model="sections.border" appearance="inspector" :title="t('border')" data-clip-section="border">
      <div class="section-block">
        <div class="prop-row">
          <span class="prop-label">{{ t('showBorder') }}</span>
          <Switch
            :model-value="borderEnabled ?? false"
            @update:modelValue="emit('update', { borderEnabled: $event })"
          />
        </div>
        <div v-if="borderEnabled" class="sub-group margin-top-sm">
          <div class="frame-field">
            <span class="sub-label">{{ t('borderColor') }}</span>
            <ColorPicker
              :model-value="borderColor ?? '#000000'"
              :show-label="false"
              @update:modelValue="emit('update', { borderColor: $event })"
            />
          </div>
          <BigSlider
            :model-value="borderWidth ?? 1"
            :min="1"
            :max="32"
            :step="1"
            :label="t('width')"
            :format-value="(value) => `${Math.round(value)}px`"
            @update:modelValue="emit('update', { borderWidth: $event })"
          />
        </div>
      </div>
    </Accordion>
    <Accordion v-model="sections.frame" appearance="inspector" :title="t('frame')" data-clip-section="frame">
      <div class="section-block">
        <div class="prop-row">
          <span class="prop-label">{{ t('frame') }}</span>
          <Switch :model-value="frameEnabled" :aria-label="t('frame')" @update:modelValue="toggleFrame" />
        </div>
        <div v-if="frameEnabled" class="sub-group margin-top-sm">
          <Select
            :model-value="activeFrame"
            :options="models"
            :label="t('frameStyle')"
            appearance="neutral"
            size="sm"
            variant="source"
            :option-height="56"
            @update:modelValue="selectFrame"
          />
          <template v-if="animated">
            <Select
              :model-value="animatedSettings.preset"
              :options="presets"
              :label="t('preset')"
              appearance="neutral"
              size="sm"
              variant="source"
              :option-height="56"
              @update:modelValue="selectPreset"
            />
            <BigSlider
              :model-value="animatedSettings.width"
              :min="1"
              :max="16"
              :step="1"
              :label="t('width')"
              :format-value="(value) => `${Math.round(value)}px`"
              @update:modelValue="updateAnimated({ width: $event })"
            />
            <BigSlider
              :model-value="animatedSettings.speed"
              :min="0"
              :max="3"
              :step="0.1"
              :label="t('animationSpeed')"
              :format-value="(value) => `${value.toFixed(1)}×`"
              @update:modelValue="updateAnimated({ speed: $event })"
            />
            <p class="frame-hint">{{ t('animatedHint') }}</p>
          </template>
          <template v-else>
            <template v-if="activeFrame === 'safari'">
              <div class="frame-field">
                <span class="sub-label">{{ t('frameTheme') }}</span>
                <ButtonGroup full variant="neutral" size="xs" role="group" :aria-label="t('frameTheme')">
                  <Button
                    v-for="mode in ['auto', 'light', 'dark'] as const"
                    :key="mode"
                    :variant="(frameTheme ?? 'auto') === mode ? 'selected' : 'ghost'"
                    size="xs"
                    :aria-pressed="(frameTheme ?? 'auto') === mode"
                    @click="emit('update', { frameTheme: mode })"
                    >{{ t(mode) }}</Button
                  >
                </ButtonGroup>
              </div>
            </template>
            <div class="frame-field">
              <span class="sub-label">{{ t('frameColor') }}</span>
              <ColorPicker
                :model-value="frameColor ?? '#c0c0c0'"
                :show-label="false"
                @update:modelValue="emit('update', { frameColor: $event })"
              />
            </div>
            <template v-if="!phoneFrame">
              <div class="frame-field">
                <label class="sub-label" for="frame-title">{{ t('windowTitle') }}</label>
                <Input
                  id="frame-title"
                  appearance="neutral"
                  size="sm"
                  :model-value="frameTitle ?? ''"
                  :placeholder="t('screenRecording')"
                  @update:modelValue="emit('update', { frameTitle: String($event) })"
                />
              </div>
              <BigSlider
                :model-value="(frameChromeScale ?? 1) * 100"
                :min="50"
                :max="200"
                :step="5"
                :label="t('windowSize')"
                :format-value="(value) => `${Math.round(value)}%`"
                @update:modelValue="emit('update', { frameChromeScale: $event / 100 })"
              />
            </template>
            <PhoneFrameFillControls
              v-else
              :model-value="phoneFrameFill"
              @update:modelValue="emit('update', { phoneFrameFill: $event })"
            />
            <template v-if="activeFrame === 'windows-95'">
              <div class="prop-row">
                <span class="prop-label">{{ t('menuBar') }}</span
                ><Switch
                  :model-value="frameShowMenu ?? true"
                  @update:modelValue="emit('update', { frameShowMenu: $event })"
                />
              </div>
              <div class="prop-row">
                <span class="prop-label">{{ t('scrollbars') }}</span
                ><Switch
                  :model-value="frameShowScrollbars ?? true"
                  @update:modelValue="emit('update', { frameShowScrollbars: $event })"
                />
              </div>
            </template>
          </template>
        </div>
      </div>
    </Accordion>
  </div>
</template>

<style scoped>
.appearance-controls {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.section-block {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.prop-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.prop-label {
  font-size: var(--font-size-body);
  font-weight: 500;
  color: var(--text-primary);
}
.sub-group {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.frame-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sub-label {
  font-size: var(--font-size-xs);
  font-weight: 500;
  color: var(--text-muted);
}
.margin-top-sm {
  margin-top: 8px;
}
.frame-hint {
  margin: 4px 0 0;
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  line-height: 1.5;
}
</style>
