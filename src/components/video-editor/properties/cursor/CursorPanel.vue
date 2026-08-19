<script setup lang="ts">
import { computed, ref } from 'vue';
import { CircleDot, FolderUp, Info, Radio, Search, Sparkles } from '@lucide/vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import Switch from '~/ui/switch/Switch.vue';
import Select from '~/ui/select/Select.vue';
import ColorInput from '~/ui/input/ColorInput.vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import AdvancedButton from '~/ui/button/AdvancedButton.vue';
import BlurRevealTransition from '~/ui/transitions/BlurRevealTransition.vue';
import Popover from '~/ui/popover/Popover.vue';
import ShadowDirectionGroup from './ShadowDirectionGroup.vue';
import CursorClickEffectsPanel from './CursorClickEffectsPanel.vue';
import Divider from '~/ui/divider/Divider.vue';
import type { ShadowDirection } from './shadow-types';
import type {
  CursorClickEffects,
  CursorMotionPreset,
  CursorMotionSettings,
  CursorRippleStyle,
} from '../../../../api/types/cursor-settings';
import {
  createDefaultCursorClickEffects,
  createDefaultCursorMotionSettings,
  cursorMotionPreset,
} from '../../../../api/types/cursor-settings';
import type { CursorPackDescriptor, CursorSelection } from '../../../../api/types/cursor-pack';
import { cursorAssetSupportsTint } from './cursor-packs';
import { capture } from '../../../../api/capture';
import { useTranslate } from '~/i18n/useTranslate';
import { useToastStore } from '~/ui/toast/toastStore';
import { CURSOR_SIZE_DEFAULT, CURSOR_SIZE_MAX, CURSOR_SIZE_MIN } from './cursor-size';

const { t } = useTranslate('CursorPanel');
const toast = useToastStore();
const cursorAdvancedOpen = ref(false);
const clickAdvancedOpen = ref(false);
const importing = ref(false);

const props = defineProps<{
  selection: CursorSelection;
  packs: CursorPackDescriptor[];
  cursorSize: number;
  cursorColor: string;
  enableShadow: boolean;
  shadowBlur: number;
  shadowColor: string;
  shadowDirection: ShadowDirection;
  clickEffects: CursorClickEffects;
  motion: CursorMotionSettings;
}>();

const emit = defineEmits<{
  (event: 'update:selection', value: CursorSelection): void;
  (event: 'preview:selection', value: CursorSelection | null): void;
  (event: 'update:cursorSize', value: number): void;
  (event: 'update:cursorColor', value: string): void;
  (event: 'update:enableShadow', value: boolean): void;
  (event: 'update:shadowBlur', value: number): void;
  (event: 'update:shadowColor', value: string): void;
  (event: 'update:shadowDirection', value: ShadowDirection): void;
  (event: 'update:clickEffects', value: CursorClickEffects): void;
  (event: 'update:motion', value: CursorMotionSettings): void;
}>();

const selectedPack = computed(() => props.packs.find((pack) => pack.id === props.selection.packId) ?? null);
const packOptions = computed(() =>
  props.packs.map((pack) => ({
    value: pack.id,
    label: pack.name,
    thumbnail: pack.cursors.find((cursor) => cursor.id === pack.defaultCursorId)?.url,
  })),
);
const cursorOptions = computed(() => [
  { value: '__automatic__', label: t('automaticRecommended'), thumbnail: selectedPack.value?.cursors[0]?.url },
  ...(selectedPack.value?.cursors.map((cursor) => ({ value: cursor.id, label: cursor.label, thumbnail: cursor.url })) ??
    []),
]);
const selectedCursorOption = computed(() =>
  props.selection.mode === 'automatic' ? '__automatic__' : (props.selection.cursorId ?? '__automatic__'),
);
const selectedColorAsset = computed(() => {
  const pack = selectedPack.value;
  if (!pack) return null;
  const cursorId = props.selection.mode === 'fixed' ? props.selection.cursorId : pack.defaultCursorId;
  return pack.cursors.find((cursor) => cursor.id === cursorId) ?? null;
});
const cursorColorAvailable = computed(() => {
  const pack = selectedPack.value;
  const asset = selectedColorAsset.value;
  return Boolean(pack && asset && cursorAssetSupportsTint(pack, asset));
});

const ripplePresets = computed(() => [
  { id: 'single' as const, label: t('presetSingle'), icon: CircleDot },
  { id: 'double' as const, label: t('presetDouble'), icon: Radio },
  { id: 'solid' as const, label: t('presetSolid'), icon: Sparkles },
]);

type GlobalRippleStyle = Exclude<CursorRippleStyle, 'none'>;

const currentRipplePreset = computed<GlobalRippleStyle>(() => {
  const left = props.clickEffects.left;
  const right = props.clickEffects.right;
  const configured = [left.rippleStyle, right.rippleStyle].find(
    (style): style is GlobalRippleStyle => style === 'single' || style === 'double' || style === 'solid',
  );
  return configured ?? 'single';
});

const selectRipplePreset = (preset: GlobalRippleStyle) =>
  emit('update:clickEffects', {
    left: { ...props.clickEffects.left, rippleStyle: preset },
    right: { ...props.clickEffects.right, rippleStyle: preset },
  });

const selectPack = (value: string | number) => {
  if (typeof value !== 'string') return;
  const pack = props.packs.find((candidate) => candidate.id === value);
  if (!pack) return;
  const cursorId =
    props.selection.mode === 'fixed' &&
    props.selection.cursorId &&
    pack.cursors.some((cursor) => cursor.id === props.selection.cursorId)
      ? props.selection.cursorId
      : null;
  emit('update:selection', { packId: pack.id, mode: cursorId ? 'fixed' : 'automatic', cursorId });
};

const selectCursor = (value: string | number) => {
  if (typeof value !== 'string') return;
  emit('preview:selection', null);
  emit(
    'update:selection',
    value === '__automatic__'
      ? { packId: props.selection.packId, mode: 'automatic', cursorId: null }
      : { packId: props.selection.packId, mode: 'fixed', cursorId: value },
  );
};

const importPack = async () => {
  importing.value = true;
  try {
    const result = await capture.pickCursorPackImport();
    if (!result) return;
    emit('update:selection', { packId: result.pack.id, mode: 'automatic', cursorId: null });
    const ignored = result.ignoredAnimatedRoles.length
      ? t('importIgnoredAnimated', { roles: result.ignoredAnimatedRoles.join(', ') })
      : '';
    toast.success(`${t('importSuccess', { count: result.importedCount })}${ignored ? ` ${ignored}` : ''}`);
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('importFailed'));
  } finally {
    importing.value = false;
  }
};
const openDiscovery = () => {
  void capture.openCursorPackDiscovery().catch(() => toast.error(t('discoveryFailed')));
};

const reset = () => {
  emit('update:selection', { packId: props.selection.packId, mode: 'automatic', cursorId: null });
  emit('update:cursorSize', CURSOR_SIZE_DEFAULT);
  emit('update:cursorColor', '#000000');
  emit('update:enableShadow', true);
  emit('update:shadowBlur', 6);
  emit('update:shadowColor', '#000000');
  emit('update:shadowDirection', 'bottom');
  emit('update:clickEffects', createDefaultCursorClickEffects());
  emit('update:motion', createDefaultCursorMotionSettings());
};

const motionPresetOptions = computed(() => [
  { value: 'focused', label: t('focusedPreset') },
  { value: 'smooth', label: t('smoothPreset') },
  { value: 'custom', label: t('customPreset') },
]);
const updateMotion = (patch: Partial<CursorMotionSettings>) =>
  emit('update:motion', {
    ...props.motion,
    ...patch,
    preset: patch.preset ?? 'custom',
  });
const selectMotionPreset = (preset: CursorMotionPreset) =>
  emit('update:motion', preset === 'custom' ? { ...props.motion, preset } : cursorMotionPreset(preset));
</script>

<template>
  <div class="options-group">
    <section class="pack-section">
      <div class="pack-heading">
        <label class="prop-label">{{ t('cursorPack') }}</label>
        <div class="heading-actions">
          <AdvancedButton
            :open="cursorAdvancedOpen"
            controls="cursor-advanced-panel"
            :label="t('advanced')"
            @update:open="cursorAdvancedOpen = $event"
          />
          <Popover interaction="hover-focus-click" :match-trigger-width="false" align="right">
            <template #trigger>
              <button type="button" class="info-button" :aria-label="t('packInfo')"><Info :size="14" /></button>
            </template>
            <div class="discovery-popover">
              <p>{{ t('packDescription') }}</p>
              <Button size="sm" :icon="Search" @click="openDiscovery">{{ t('findCursorPacks') }}</Button>
              <a
                href="https://github.com/KDE/breeze/blob/master/cursors/svg-cursor-format.md"
                target="_blank"
                rel="noreferrer"
              >
                {{ t('compatibleFormat') }}
              </a>
            </div>
          </Popover>
        </div>
      </div>
      <div class="pack-row">
        <Select
          class="pack-select"
          :model-value="selection.packId"
          :options="packOptions"
          @update:model-value="selectPack"
        />
        <Button
          class="pack-import-button"
          size="sm"
          variant="outline"
          :icon="FolderUp"
          icon-only
          :tooltip="t('import')"
          :aria-label="t('import')"
          :loading="importing"
          @click="importPack"
        />
      </div>
      <div v-if="!selectedPack" class="missing-pack" role="alert">
        {{ t('missingPack') }}
        <Button size="xs" variant="link" @click="importPack">{{ t('importPack') }}</Button>
      </div>
      <BlurRevealTransition>
        <div v-if="cursorAdvancedOpen" id="cursor-advanced-panel" class="advanced-options">
          <div class="prop-item">
            <label class="prop-label">{{ t('cursorStyle') }}</label>
            <Select
              :model-value="selectedCursorOption"
              :options="cursorOptions"
              :disabled="!selectedPack"
              @preview:model-value="
                (value) =>
                  emit(
                    'preview:selection',
                    typeof value === 'string' && value !== '__automatic__'
                      ? { packId: selection.packId, mode: 'fixed', cursorId: value }
                      : null,
                  )
              "
              @update:model-value="selectCursor"
            />
          </div>
        </div>
      </BlurRevealTransition>
    </section>

    <Divider spacing="none" />
    <BigSlider
      class="cursor-size-control"
      :model-value="cursorSize"
      :default-value="CURSOR_SIZE_DEFAULT"
      :min="CURSOR_SIZE_MIN"
      :max="CURSOR_SIZE_MAX"
      :label="t('cursorSize')"
      :format-value="(value) => `${value}px`"
      @update:model-value="emit('update:cursorSize', $event)"
    />

    <template v-if="cursorColorAvailable">
      <Divider spacing="none" />
      <ColorInput
        :label="t('cursorColor')"
        :model-value="cursorColor"
        @update:model-value="emit('update:cursorColor', $event)"
      />
    </template>

    <Divider spacing="none" />
    <div class="prop-row">
      <span class="prop-label">{{ t('dropShadow') }}</span>
      <Switch :model-value="enableShadow" @update:model-value="emit('update:enableShadow', $event)" />
    </div>
    <div v-if="enableShadow" class="nested-options">
      <BigSlider
        :model-value="shadowBlur"
        :min="1"
        :max="24"
        :label="t('shadowBlur')"
        :format-value="(value) => `${value}px`"
        @update:model-value="emit('update:shadowBlur', $event)"
      />
      <ColorInput
        :label="t('shadowColor')"
        :model-value="shadowColor"
        @update:model-value="emit('update:shadowColor', $event)"
      />
      <div class="prop-item">
        <span class="sub-label">{{ t('direction') }}</span>
        <ShadowDirectionGroup
          :model-value="shadowDirection"
          @update:model-value="emit('update:shadowDirection', $event)"
        />
      </div>
    </div>

    <Divider spacing="none" />
    <div class="prop-item click-effects-control">
      <div class="section-control-heading">
        <span class="prop-label">{{ t('rippleStyle') }}</span>
        <AdvancedButton
          :open="clickAdvancedOpen"
          controls="click-effects-advanced-panel"
          :label="t('advanced')"
          @update:open="clickAdvancedOpen = $event"
        />
      </div>
      <ButtonGroup full>
        <Button
          v-for="preset in ripplePresets"
          :key="preset.id"
          variant="tab"
          size="sm"
          block
          :class="{ active: currentRipplePreset === preset.id }"
          :tooltip="preset.label"
          :aria-label="preset.label"
          :icon="preset.icon"
          icon-only
          @click="selectRipplePreset(preset.id)"
        />
      </ButtonGroup>
      <BlurRevealTransition>
        <div v-if="clickAdvancedOpen" id="click-effects-advanced-panel" class="advanced-options">
          <CursorClickEffectsPanel
            :model-value="clickEffects"
            @update:model-value="emit('update:clickEffects', $event)"
          />
        </div>
      </BlurRevealTransition>
    </div>

    <Divider spacing="none" />
    <section class="motion-options">
      <div class="section-heading">
        <span class="section-title">{{ t('cursorMotion') }}</span>
        <span class="section-description">{{ t('cursorMotionDescription') }}</span>
      </div>
      <div class="prop-item">
        <label class="prop-label">{{ t('motionPreset') }}</label>
        <Select
          :model-value="motion.preset"
          :options="motionPresetOptions"
          @update:model-value="selectMotionPreset($event as CursorMotionPreset)"
        />
      </div>
      <BigSlider
        :model-value="motion.smoothing"
        :min="0"
        :max="1"
        :step="0.01"
        :label="t('cursorSmoothing')"
        :format-value="(value) => `${Math.round(value * 100)}%`"
        @update:model-value="updateMotion({ smoothing: $event })"
      />
      <BigSlider
        :model-value="motion.springMassMultiplier"
        :min="0.5"
        :max="2"
        :step="0.01"
        :label="t('springMassMultiplier')"
        :format-value="(value) => value.toFixed(2)"
        @update:model-value="updateMotion({ springMassMultiplier: $event })"
      />
      <BigSlider
        :model-value="motion.motionBlur"
        :min="0"
        :max="1"
        :step="0.01"
        :label="t('motionBlur')"
        :format-value="(value) => `${Math.round(value * 100)}%`"
        @update:model-value="updateMotion({ motionBlur: $event })"
      />
    </section>

    <Divider spacing="none" />
    <Button class="reset-automatic-button" size="sm" variant="ghost" block @click="reset">
      {{ t('resetAutomaticDefaults') }}
    </Button>
  </div>
</template>

<style scoped src="./cursor-panel.css"></style>
