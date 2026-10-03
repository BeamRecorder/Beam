<script setup lang="ts">
import { ArrowLeftRight, Plus, RotateCw, SwatchBook } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import Input from '~/ui/input/Input.vue';
import Popover from '~/ui/popover/Popover.vue';
import ScrollShadow from '~/ui/scroll-shadow/ScrollShadow.vue';
import { useTranslate } from '~/i18n/useTranslate';
import GradientStops from './GradientStops.vue';
import GradientStopRow from './GradientStopRow.vue';
import { useGradient } from './composables/useGradient';
import { gradientCss } from './gradient-stops';
import type { GradientProps, GradientValue } from './gradient-types';

const props = withDefaults(defineProps<GradientProps>(), { showAngle: false, disabled: false });
const emit = defineEmits<{ (event: 'update:modelValue', value: GradientValue): void }>();
const { t } = useTranslate('Gradient');
const {
  value,
  selectedStopId,
  preview,
  effectiveMinStops,
  canAdd,
  selectStop,
  addStop,
  removeStop,
  updateStop,
  updateGradientType,
  updateGradientAngle,
  reverseStops,
  applyPreset,
} = useGradient(props, emit);
</script>

<template>
  <div class="gradient-editor">
    <div v-if="showAngle" class="gradient-toolbar">
      <ButtonGroup full size="xs" variant="neutral" :columns="2" role="group" :aria-label="t('type')">
        <Button
          v-for="type in ['linear', 'radial']"
          :key="type"
          size="xs"
          :variant="value.type === type ? 'selected' : 'ghost'"
          :aria-pressed="value.type === type"
          :disabled="disabled"
          @click="updateGradientType(type)"
          >{{ t(type) }}</Button
        >
      </ButtonGroup>
      <Input
        v-if="value.type === 'linear'"
        type="number"
        size="xs"
        appearance="neutral"
        commit-on-blur
        :model-value="Number(value.angle!.toFixed(2))"
        :step="1"
        unit="°"
        :aria-label="t('angle')"
        :disabled="disabled"
        @update:model-value="updateGradientAngle"
      />
      <Button
        v-if="value.type === 'linear'"
        variant="ghost"
        size="xs"
        icon-only
        :icon="RotateCw"
        :disabled="disabled"
        :tooltip="t('rotate')"
        :aria-label="t('rotate')"
        @click="updateGradientAngle(value.angle! + 90)"
      />
    </div>
    <div class="gradient-preview transparency-grid" aria-hidden="true"><div :style="{ background: preview }" /></div>
    <GradientStops
      :stops="value.stops"
      :selected-id="selectedStopId"
      :can-add="canAdd"
      :disabled="disabled"
      @select="selectStop"
      @add="addStop"
      @move="(id, position) => updateStop(id, { position })"
      @remove="removeStop"
    />
    <div class="gradient-list-header">
      <span>{{ t('stops') }}</span>
      <div class="gradient-actions">
        <Popover v-if="presets?.length" :match-trigger-width="false" align="right">
          <template #trigger
            ><Button
              variant="ghost"
              size="xs"
              icon-only
              :icon="SwatchBook"
              :disabled="disabled"
              :tooltip="t('presets')"
              :aria-label="t('presets')"
          /></template>
          <template #default="{ close }"
            ><div class="gradient-presets">
              <Button
                v-for="preset in presets"
                :key="preset.id"
                variant="secondary"
                size="xs"
                :disabled="
                  disabled || preset.stops.length < effectiveMinStops || preset.stops.length > (maxStops ?? Infinity)
                "
                @click="
                  applyPreset(preset);
                  close();
                "
                ><template #icon
                  ><span
                    class="preset-swatch"
                    :style="{ background: gradientCss({ stops: preset.stops }, true) }" /></template
                >{{ preset.id }}</Button
              >
            </div></template
          >
        </Popover>
        <Button
          variant="ghost"
          size="xs"
          icon-only
          :icon="ArrowLeftRight"
          :disabled="disabled"
          :tooltip="t('reverse')"
          :aria-label="t('reverse')"
          @click="reverseStops"
        />
        <Button
          variant="ghost"
          size="xs"
          icon-only
          :icon="Plus"
          :disabled="!canAdd"
          :tooltip="t('addStop')"
          :aria-label="t('addStop')"
          @click="addStop()"
        />
      </div>
    </div>
    <div class="gradient-column-labels" aria-hidden="true">
      <span>{{ t('color') }}</span
      ><span>{{ t('position') }}</span
      ><span>{{ t('opacity') }}</span
      ><span />
    </div>
    <ScrollShadow class="gradient-stop-list" :size="12">
      <GradientStopRow
        v-for="(stop, index) in value.stops"
        :key="stop.id"
        :stop="stop"
        :index="index"
        :selected="stop.id === selectedStopId"
        :removable="value.stops.length > effectiveMinStops"
        :disabled="disabled"
        @select="selectStop(stop.id)"
        @update="updateStop(stop.id, $event)"
        @remove="removeStop(stop.id)"
      />
    </ScrollShadow>
  </div>
</template>

<style scoped src="./Gradient.css" />
