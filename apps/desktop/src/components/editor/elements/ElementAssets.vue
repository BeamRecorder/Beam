<script setup lang="ts">
import { computed } from 'vue';
import { Library, Plus, Trash2 } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import Button from '~/ui/button/Button.vue';
import Popover from '~/ui/popover/Popover.vue';
import ScrollShadow from '~/ui/scroll-shadow/ScrollShadow.vue';
import { useToastStore } from '~/ui/toast/toastStore';
import { useElementEditor } from './useElementEditor';
import { useElementAssets } from './useElementAssets';
import { saveElementAsset } from '@beam/engine/shared/element-assets';
import type { ShapeLayerFamily } from '@beam/engine/shared/shape-layer-types';
import ShapeTimelinePreview from '../timeline/ShapeTimelinePreview.vue';
import { elementAssetPreviewClip } from './element-asset-preview';

const props = defineProps<{ family: ShapeLayerFamily; disabled?: boolean }>();
const emit = defineEmits<{ select: [] }>();
const editor = useElementEditor(),
  store = useElementAssets(),
  toast = useToastStore(),
  { t } = useI18n();
const blocked = computed(() => props.disabled || store.busy || !editor?.canInteract.value);
const perform = async (action: () => Promise<unknown>) => {
  try {
    await action();
  } catch (error) {
    toast.add(`${t('Onboarding.saveError')}${error instanceof Error ? ` ${error.message}` : ''}`, 'error');
  }
};
const clip = computed(() => (editor?.selected.value?.family === props.family ? editor.selected.value : null));
const assets = computed(() => store.assets.filter((asset) => asset.style.family === props.family));
const save = () => {
  if (blocked.value || !clip.value || !editor?.canvasSize.value) return;
  const snapshot = {
      ...clip.value,
      ...(editor.editing.value?.id === clip.value.id ? { text: editor.editing.value.text } : {}),
    },
    canvas = editor.canvasSize.value;
  void perform(() => store.add(saveElementAsset(snapshot, canvas)));
};
</script>
<template>
  <Popover :match-trigger-width="false" :disabled="disabled" @toggle="$event && perform(store.load)">
    <template #trigger="{ isOpen }">
      <Button
        size="xs"
        icon-only
        variant="ghost"
        :icon="Library"
        :aria-label="t('Elements.savedElements')"
        :tooltip="t('Elements.savedElements')"
        :aria-expanded="isOpen"
        :disabled="disabled"
      />
    </template>
    <template #default="{ close }">
      <div class="asset-library">
        <div class="asset-header">
          <strong>{{ t('Elements.savedElements') }}</strong>
          <Button
            size="xs"
            icon-only
            variant="ghost"
            :icon="Plus"
            :tooltip="t('Elements.saveElement')"
            :aria-label="t('Elements.saveElement')"
            :disabled="blocked || !clip || !editor?.canvasSize.value"
            @click="save"
          />
        </div>
        <ScrollShadow class="asset-scroll">
          <p v-if="!assets.length" class="empty">{{ t('Elements.noSavedElements') }}</p>
          <div v-for="asset in assets" :key="asset.id" class="asset-row">
            <Button
              block
              size="sm"
              variant="ghost"
              align="start"
              :style="{ height: 'auto', minHeight: '56px' }"
              :disabled="blocked"
              @click="
                editor?.addAsset(asset);
                close();
                emit('select');
              "
            >
              <template v-if="editor?.canvasSize.value" #icon>
                <span class="asset-artwork" aria-hidden="true">
                  <ShapeTimelinePreview
                    :clip="elementAssetPreviewClip(asset, editor.canvasSize.value)"
                    :canvas="editor.canvasSize.value"
                    presentation="thumbnail"
                    :style="{ width: '100%', height: '100%' }"
                  />
                </span>
              </template>
              {{ asset.name }}
            </Button>
            <Button
              class="asset-remove"
              :style="{ width: '44px', height: '44px' }"
              size="md"
              icon-only
              variant="ghost"
              :icon="Trash2"
              :disabled="blocked"
              :aria-label="`${t('Elements.removeSavedElement')}: ${asset.name}`"
              :tooltip="t('Elements.removeSavedElement')"
              @click="perform(() => store.remove(asset.id))"
            />
          </div>
        </ScrollShadow>
      </div>
    </template>
  </Popover>
</template>
<style scoped>
.asset-library {
  width: 264px;
  max-width: calc(100vw - 32px);
}
.asset-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
}
.asset-header strong {
  font-size: var(--font-size-body);
  color: var(--text-primary);
}
.asset-scroll {
  max-height: 240px;
}
.asset-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 4px;
  padding: 4px;
}
.asset-artwork {
  display: block;
  width: 64px;
  height: 44px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: repeating-conic-gradient(var(--color-bg-element) 0% 25%, var(--color-bg-surface-hover) 0% 50%) 0 0 / 8px
    8px;
}
.empty {
  padding: 12px;
  color: var(--text-secondary);
  font-size: var(--font-size-body);
}
</style>
