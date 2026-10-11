<script setup lang="ts">
import { Check, Film, LoaderCircle, X } from '@lucide/vue';
import Button from '../button/Button.vue';
import Beamy from '../../brand/Beamy/Beamy.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { StatusPillProps } from './status-pill-types';
import StatusPillAura from './StatusPillAura.vue';

defineProps<StatusPillProps>();
defineEmits<{ dismiss: [] }>();
const { t } = useTranslate('QuickSnipStatus');
</script>

<template>
  <section
    class="snip-surface"
    :class="{
      expanded,
      completed,
      failed,
      'opens-below': opensBelow,
      'native-draggable': nativeDraggable,
    }"
  >
    <div class="snip-details" :inert="!expanded" :aria-hidden="!expanded">
      <slot name="details" />
    </div>
    <div
      class="snip-pill"
      tabindex="0"
      :aria-label="percent === null || completed || failed ? label : `${label} ${percent}%`"
    >
      <div class="thumbnail" aria-hidden="true">
        <img v-if="preview" :src="preview" alt="" />
        <Film v-else :size="22" />
        <span v-if="completed" class="success-mark"><Check :size="13" /></span>
      </div>
      <div class="status-copy">
        <strong role="status">{{ label }}</strong>
        <span :title="detail">{{ detail }}</span>
        <slot name="detail" />
      </div>
      <div class="status-value" :class="{ 'mascot-value': mascot, 'has-completion-actions': $slots.value }">
        <template v-if="mascot && !completed">
          <Beamy :key="jobKey" :phase="mascotPhase ?? 'loading'" :size="52" :celebrate="false" />
          <span v-if="!completed && !failed && percent !== null" class="mascot-percent"
            >{{ percent }}<small>%</small></span
          >
        </template>
        <template v-if="completed"
          ><slot name="value"><Check class="completion-check" :size="20" aria-hidden="true" /></slot
        ></template>
        <Button
          v-else-if="failed && !mascot"
          size="xs"
          variant="ghost"
          icon-only
          :icon="X"
          :aria-label="t('dismiss')"
          :title="t('dismiss')"
          @click="$emit('dismiss')"
        />
        <template v-else-if="!mascot && !completed && !failed">
          <span v-if="percent !== null">{{ percent }}<small>%</small></span>
          <LoaderCircle v-if="percent === null || percent === 0" class="spinner" :size="12" />
        </template>
      </div>
      <div
        v-if="!completed && !failed"
        class="progress"
        :class="{ indeterminate: percent === null }"
        role="progressbar"
        :aria-label="label"
        :aria-valuenow="percent ?? undefined"
        :aria-valuemin="0"
        :aria-valuemax="100"
      >
        <i :style="percent === null ? undefined : { transform: `scaleX(${percent / 100})` }" />
      </div>
    </div>
    <StatusPillAura v-if="completed" />
  </section>
</template>

<style scoped src="./status-pill.css"></style>
