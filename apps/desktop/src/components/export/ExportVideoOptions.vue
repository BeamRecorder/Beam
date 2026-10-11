<script setup lang="ts">
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import TogglePreference from '~/components/settings/TogglePreference.vue';
import InfoTooltip from '~/ui/tooltip/InfoTooltip.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { ExportPreset } from '@beam/encoder/export-types';
import type { ExportFrameRate, ExportResolutionOption } from './export-dialog-types';

const { t } = useTranslate('ExportPopover');
defineProps<{
  nativeHeight: number;
  disabled?: boolean;
  resolutionDescriptions: Record<ExportResolutionOption, string>;
  presetDescriptions: Record<ExportPreset, string>;
  frameRateDescriptions: Record<ExportFrameRate, string>;
}>();
const preset = defineModel<ExportPreset>('preset', { required: true });
const resolution = defineModel<ExportResolutionOption>('resolution', { required: true });
const frameRate = defineModel<ExportFrameRate>('frameRate', { required: true });
const includeAudio = defineModel<boolean>('includeAudio', { required: true });
const exportUntilPlayhead = defineModel<boolean>('exportUntilPlayhead', { required: true });
const presets: ExportPreset[] = ['low', 'medium', 'high'];
const frameRates: ExportFrameRate[] = [24, 30, 60];
</script>

<template>
  <div class="export-video-options">
    <div class="export-output-options">
      <div class="field">
        <div class="field-heading">
          <span class="field-label">{{ t('qualityAndBitrate') }}</span>
          <InfoTooltip :content="presetDescriptions[preset]" position="left" />
        </div>
        <ButtonGroup full variant="neutral" :selection="{ index: presets.indexOf(preset), count: 3 }">
          <Button
            v-for="value in presets"
            :key="value"
            variant="tab"
            size="xs"
            block
            :class="{ active: preset === value }"
            :aria-pressed="preset === value"
            @click="preset = value"
          >
            {{ t(value) }}
          </Button>
        </ButtonGroup>
      </div>

      <div class="field">
        <div class="field-heading">
          <span class="field-label">{{ t('resolution') }}</span>
          <InfoTooltip :content="resolutionDescriptions[resolution]" position="left" />
        </div>
        <ButtonGroup
          full
          variant="neutral"
          :selection="{ index: ['720p', '1080p', 'max'].indexOf(resolution), count: 3 }"
        >
          <Button
            variant="tab"
            size="xs"
            block
            :disabled="nativeHeight < 720"
            :class="{ active: resolution === '720p' }"
            :aria-pressed="resolution === '720p'"
            @click="resolution = '720p'"
          >
            {{ t('res720p') }}
          </Button>
          <Button
            variant="tab"
            size="xs"
            block
            :disabled="nativeHeight < 1080"
            :class="{ active: resolution === '1080p' }"
            :aria-pressed="resolution === '1080p'"
            @click="resolution = '1080p'"
          >
            {{ t('res1080p') }}
          </Button>
          <Button
            variant="tab"
            size="xs"
            block
            :class="{ active: resolution === 'max' }"
            :aria-pressed="resolution === 'max'"
            :tooltip="resolutionDescriptions.max"
            @click="resolution = 'max'"
          >
            {{ t('resMax') }}
          </Button>
        </ButtonGroup>
      </div>

      <div class="field">
        <div class="field-heading">
          <span class="field-label">{{ t('frameRate') }}</span>
          <InfoTooltip :content="frameRateDescriptions[frameRate]" position="left" />
        </div>
        <ButtonGroup full variant="neutral" :selection="{ index: frameRates.indexOf(frameRate), count: 3 }">
          <Button
            v-for="value in frameRates"
            :key="value"
            variant="tab"
            size="xs"
            block
            :class="{ active: frameRate === value }"
            :aria-pressed="frameRate === value"
            @click="frameRate = value"
          >
            {{ value }} fps
          </Button>
        </ButtonGroup>
      </div>
    </div>
    <div class="export-content-options">
      <TogglePreference
        v-model="includeAudio"
        class="export-audio"
        :label="t('includeAudio')"
        :description="t('includeAudioDesc')"
        :disabled="disabled"
        switch-variant="primary"
      />
      <TogglePreference
        v-model="exportUntilPlayhead"
        class="export-range"
        :label="t('exportUntilPlayhead')"
        :description="t('exportUntilPlayheadDesc')"
        :disabled="disabled"
        switch-variant="primary"
      />
    </div>
  </div>
</template>

<style scoped src="./export-dialog.css"></style>
