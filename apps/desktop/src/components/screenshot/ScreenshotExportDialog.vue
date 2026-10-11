<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { Download } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Dialog from '~/ui/dialog/Dialog.vue';
import Input from '~/ui/input/Input.vue';
import Select from '~/ui/select/Select.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { ScreenshotState } from '@beam/engine/screenshot/screenshot-types';
import type { ScreenshotDimensions } from './screenshot-types';
import type { ScreenshotExportOptions, ScreenshotExportOutcome } from './screenshot-export-types';
import ScreenshotSizeControls from './ScreenshotSizeControls.vue';
import DirectoryPreference from '~/components/settings/DirectoryPreference.vue';
import { formatExportSize } from '../export/export-size';
import ExportStatusPill from '../export/ExportStatusPill.vue';
import type { ExportMorphSource } from '../export/export-status-types';
import { captureExportMorph } from '../export/useExportPillMorph';

const props = defineProps<{
  state: ScreenshotState;
  original: ScreenshotDimensions;
  projectName: string;
  busy: boolean;
  error: string;
  save: (fileName: string, options?: ScreenshotExportOptions) => Promise<ScreenshotExportOutcome | undefined>;
}>();
const advanced = defineModel<boolean>('advanced', { required: true });
const keepAspect = defineModel<boolean>('keepAspect', { required: true });
const { t } = useTranslate('ScreenshotEditor');
const { t: exportText, locale } = useTranslate('ExportPopover');
const isOpen = ref(false);
const fileName = ref(props.projectName);
watch(
  () => props.projectName,
  (name, previous) => {
    if (fileName.value === previous) fileName.value = name;
  },
);
const result = ref<ScreenshotExportOutcome | null>(null);
const dialog = ref<InstanceType<typeof Dialog> | null>(null);
const morphFrom = ref<ExportMorphSource | null>(null);
const pillVisible = ref(false);
const jobSequence = ref(0);
const exporting = ref(false);
const preview = ref<string | null>(null);
const report = ref('');
const exportError = ref('');
const jobName = ref('');
const jobFormat = ref('');
let controller: AbortController | null = null;
const open = () => {
  if (exporting.value) {
    document.querySelector<HTMLElement>('.export-status-host .snip-pill')?.focus();
    return;
  }
  morphFrom.value = null;
  isOpen.value = true;
};
const close = () => {
  isOpen.value = false;
};
defineExpose({ open });
const run = async () => {
  if (props.busy || exporting.value || !fileName.value.trim()) return;
  morphFrom.value = captureExportMorph(dialog.value?.content);
  result.value = null;
  preview.value = null;
  report.value = '';
  exportError.value = '';
  jobName.value = fileName.value.trim();
  jobFormat.value = props.state.format;
  const abort = new AbortController();
  controller = abort;
  exporting.value = true;
  jobSequence.value += 1;
  pillVisible.value = true;
  isOpen.value = false;
  try {
    const saved = await props.save(jobName.value, {
      signal: abort.signal,
      onPreview: (src) => {
        preview.value = src;
      },
      onReport: (value) => {
        report.value = JSON.stringify(value, null, 2);
      },
    });
    if (saved?.status === 'saved') result.value = saved;
    else if (!abort.signal.aborted && props.error) exportError.value = props.error;
    else pillVisible.value = false;
  } catch (reason) {
    if (!abort.signal.aborted) exportError.value = reason instanceof Error ? reason.message : String(reason);
    else pillVisible.value = false;
  } finally {
    exporting.value = false;
    controller = null;
  }
};
const cancel = () => controller?.abort();
onBeforeUnmount(cancel);
</script>

<template>
  <Button class="export-trigger" variant="primary" size="sm" :icon="Download" style="height: 2rem" @click="open">{{
    t('export')
  }}</Button>
  <Dialog
    ref="dialog"
    :animate="!morphFrom"
    :is-open="isOpen"
    :title="t('exportImage')"
    size="lg"
    scroll-shadow
    @close="close"
  >
    <section class="export-dialog">
      <div class="export-fields">
        <div class="export-destination">
          <label class="field">
            <span class="field-label">{{ exportText('fileName') }}</span>
            <Input
              v-model="fileName"
              :unit="`.${state.format}`"
              :aria-label="exportText('fileName')"
              data-dialog-autofocus
            />
          </label>
          <label class="field">
            <span class="field-label">{{ t('imageFormat') }}</span>
            <Select
              v-model="state.format"
              :options="[
                { label: 'PNG', value: 'png' },
                { label: 'WebP', value: 'webp' },
              ]"
              :aria-label="t('imageFormat')"
              appearance="neutral"
              size="lg"
            />
          </label>
          <DirectoryPreference class="export-directory" kind="exports" compact />
        </div>
        <div class="export-output-options screenshot-output-options">
          <ScreenshotSizeControls
            v-model:canvas="state.canvas"
            v-model:advanced="advanced"
            v-model:keep-aspect="keepAspect"
            :original="original"
          />
          <div class="field">
            <BigSlider
              v-if="state.format === 'webp'"
              v-model="state.quality"
              :label="t('quality')"
              :min="0.1"
              :max="1"
              :step="0.01"
            />
            <p class="option-hint">{{ t('transparency') }}</p>
          </div>
        </div>
      </div>
    </section>
    <template #footer>
      <div class="export-footer">
        <span class="option-hint">{{ state.canvas.width }} × {{ state.canvas.height }} px</span>
        <Button variant="primary" :icon="Download" :loading="busy" :disabled="busy || !fileName.trim()" @click="run">{{
          t('saveImage')
        }}</Button>
      </div>
    </template>
  </Dialog>
  <ExportStatusPill
    v-if="pillVisible"
    :key="jobSequence"
    kind="image"
    :state="exportError ? 'failed' : result ? 'completed' : 'working'"
    :name="jobName"
    :format="jobFormat"
    :preview="preview"
    :file-path="result?.path"
    :detail="result ? `${result.path} · ${formatExportSize(result.bytes, locale)}` : undefined"
    :error="exportError"
    :report="report"
    :morph-from="morphFrom"
    @cancel="cancel"
    @dismiss="pillVisible = false"
  />
</template>

<style scoped src="../export/export-dialog.css"></style>
