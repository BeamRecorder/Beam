<script setup lang="ts">
import { useElementEditor } from '../../elements/useElementEditor';
import ElementTextControls from '../../elements/ElementTextControls.vue';
import DrawingControls from '../../elements/DrawingControls.vue';
import ShapePicker from '../../elements/ShapePicker.vue';
import { computed, ref, watch } from 'vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import ColorPicker from '~/ui/ColorPicker/ColorPicker.vue';
import Divider from '~/ui/divider/Divider.vue';
import Switch from '~/ui/switch/Switch.vue';
import ShadowDirectionGroup from '../cursor/ShadowDirectionGroup.vue';
import type { ShapeClip } from '~/media/shared/composition-types';
import { defaultShapePresetFor, normalizeShapeLayerStyle, shapeLayerFill } from '~/media/shared/shape-layer-style';
import type { ColorFill } from '~/media/shared/color-fill-types';
import type { ShapeKind } from '~/media/shared/shape-catalog';
import type { ShapeLayerFamily, ShapeLayerStyle } from '~/media/shared/shape-layer-types';
import { useTranslate } from '~/i18n/useTranslate';
import ColorFillPresetControls from '../ColorFillPresetControls.vue';

const props = defineProps<{ clip: ShapeClip }>();
const emit = defineEmits<{ update: [patch: Partial<ShapeLayerStyle>] }>();
const { t } = useTranslate('CanvasPanel');
const { t: elementText } = useTranslate('Elements');
const editor = useElementEditor();
const showText = ref(props.clip.family === 'text');
watch(
  () => [props.clip.id, editor?.editing.value?.id],
  () => {
    if (props.clip.family === 'text' || editor?.editing.value?.id === props.clip.id) showText.value = true;
  },
  { immediate: true },
);
const style = computed(() => normalizeShapeLayerStyle(props.clip));
const shapePreset = computed(() => style.value.preset as ShapeKind);
const fill = computed(() => shapeLayerFill(style.value));
const update = (patch: Partial<ShapeLayerStyle>) => emit('update', patch);
const updateFill = (value: ColorFill) =>
  update({
    fill: value,
    ...(value.kind === 'color' ? { fillColor: value.color } : {}),
  });
const selectFamily = (family: ShapeLayerFamily) => update({ family, preset: defaultShapePresetFor(family) });
const rotationPresets = [0, 90, 180, 270] as const;
</script>

<template>
  <section class="shape-panel">
    <ButtonGroup full :columns="2" size="xs">
      <Button size="xs" :variant="showText ? 'secondary' : 'primary'" @click="showText = false">{{
        elementText('appearance')
      }}</Button>
      <Button size="xs" :variant="showText ? 'primary' : 'secondary'" @click="showText = true">{{
        elementText('text')
      }}</Button>
    </ButtonGroup>
    <ElementTextControls v-if="showText" :clip="clip" @update="update({ text: $event })" />
    <template v-else>
      <ButtonGroup
        v-if="style.family === 'shape' || style.family === 'arrow'"
        full
        :columns="2"
        size="xs"
        :aria-label="t('shapeFamily')"
      >
        <Button
          block
          size="xs"
          :variant="style.family === 'shape' ? 'primary' : 'secondary'"
          @click="selectFamily('shape')"
        >
          {{ t('shapes') }}
        </Button>
        <Button
          block
          size="xs"
          :variant="style.family === 'arrow' ? 'primary' : 'secondary'"
          @click="selectFamily('arrow')"
        >
          {{ t('arrows') }}
        </Button>
      </ButtonGroup>

      <ShapePicker
        v-if="style.family === 'shape'"
        :model-value="shapePreset"
        @update:model-value="update({ preset: $event })"
      />

      <ButtonGroup full size="xs" :aria-label="t('shapeRotation')">
        <Button
          v-for="rotation in rotationPresets"
          :key="rotation"
          block
          size="xs"
          :variant="style.rotation === rotation ? 'primary' : 'secondary'"
          @click="update({ rotation })"
        >
          {{ rotation }}°
        </Button>
      </ButtonGroup>

      <BigSlider
        :model-value="style.rotation"
        :min="0"
        :max="360"
        :step="1"
        :default-value="0"
        :label="t('shapeRotation')"
        :format-value="(value) => `${Math.round(value)}°`"
        @update:model-value="update({ rotation: $event })"
      />

      <BigSlider
        v-if="style.family === 'shape' && style.preset === 'rounded-rectangle'"
        :model-value="style.cornerRadius"
        :min="0"
        :max="50"
        :step="1"
        :default-value="16"
        :label="t('shapeCornerRadius')"
        @update:model-value="update({ cornerRadius: $event })"
      />
      <template v-if="style.family === 'arrow'">
        <BigSlider
          :model-value="style.arrowThickness"
          :min="0"
          :max="80"
          :step="1"
          :default-value="36"
          :label="t('arrowThickness')"
          @update:model-value="update({ arrowThickness: $event })"
        />
        <BigSlider
          :model-value="style.arrowHeadSize"
          :min="0"
          :max="70"
          :step="1"
          :default-value="38"
          :label="t('arrowHeadSize')"
          @update:model-value="update({ arrowHeadSize: $event })"
        />
      </template>

      <DrawingControls
        v-if="clip.drawing && style.family === 'drawing'"
        :model-value="{ ...clip.drawing, color: style.fillColor, fill }"
        @update:model-value="
          update({
            fill: $event.fill,
            ...($event.fill?.kind === 'color' ? { fillColor: $event.fill.color } : {}),
            drawing: { ...clip.drawing, smoothing: $event.smoothing, strokeWidth: $event.strokeWidth },
          })
        "
      />
      <Divider />
      <template v-if="style.family !== 'text'">
        <div v-if="style.family !== 'drawing'" class="toggle-row">
          <span>{{ t('fillColor') }}</span>
          <Switch
            :model-value="style.fillEnabled"
            :aria-label="t('fillColor')"
            @update:model-value="update({ fillEnabled: $event })"
          />
        </div>
        <ColorFillPresetControls
          v-if="style.family !== 'drawing' && style.fillEnabled"
          :model-value="fill"
          :label="t('fillColor')"
          @update:model-value="updateFill"
        />
        <ColorPicker
          :model-value="style.borderColor"
          :label="t('borderColor')"
          @update:model-value="update({ borderColor: $event })"
        />
        <BigSlider
          :model-value="style.borderWidth"
          :min="0"
          :max="40"
          :step="1"
          :default-value="0"
          :label="t('borderWidth')"
          @update:model-value="update({ borderWidth: $event })"
        />
      </template>
      <Divider />
      <div class="toggle-row">
        <span>{{ t('itemOpacity') }}</span>
        <Switch
          :model-value="style.opacityEnabled"
          :aria-label="t('itemOpacity')"
          @update:model-value="update({ opacityEnabled: $event })"
        />
      </div>
      <template v-if="style.opacityEnabled">
        <BigSlider
          :model-value="style.opacity"
          :min="0"
          :max="100"
          :step="1"
          :default-value="70"
          :label="t('itemOpacity')"
          @update:model-value="update({ opacity: $event })"
        />
        <BigSlider
          v-if="style.family !== 'text' && style.family !== 'drawing'"
          :model-value="style.backdropBlur"
          :min="0"
          :max="100"
          :step="1"
          :default-value="35"
          :label="t('colorLayerBackdropBlur')"
          @update:model-value="update({ backdropBlur: $event })"
        />
      </template>

      <template v-if="style.family !== 'text'">
        <Divider />
        <div class="toggle-row">
          <span>{{ t('colorLayerShadow') }}</span
          ><Switch
            :model-value="style.shadowEnabled"
            :aria-label="t('colorLayerShadow')"
            @update:model-value="update({ shadowEnabled: $event })"
          />
        </div>
        <template v-if="style.shadowEnabled">
          <ColorPicker
            :model-value="style.shadowColor"
            :label="t('shadowColor')"
            @update:model-value="update({ shadowColor: $event })"
          />
          <BigSlider
            :model-value="style.shadowBlur"
            :min="0"
            :max="96"
            :step="1"
            :default-value="32"
            :label="t('shadowBlur')"
            @update:model-value="update({ shadowBlur: $event })"
          />
          <ShadowDirectionGroup
            :model-value="style.shadowDirection"
            @update:model-value="update({ shadowDirection: $event })"
          />
        </template>
      </template>
    </template>
  </section>
</template>

<style scoped>
.shape-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
}
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--text-secondary);
  font-size: 12px;
}
.section-label {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
}
</style>
