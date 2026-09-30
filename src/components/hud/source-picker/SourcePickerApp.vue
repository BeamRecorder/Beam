<script setup lang="ts">
import { computed, ref } from 'vue';
import type { SourcePickerAction, SourcePickerKind, SourcePickerSource } from '~/api/types/source-picker';
import { useSourcePicker } from './useSourcePicker';
import SourcePicker from './SourcePicker.vue';
import SourceArtwork from './SourceArtwork.vue';

const params = new URLSearchParams(location.search);
const props = defineProps<{ initialSources?: SourcePickerSource[] }>();
const kind: SourcePickerKind = params.get('kind') === 'screen' ? 'screen' : 'window';
const { state, highlighted, selected, send } = useSourcePicker(kind);
const active = computed(() => highlighted.value || selected.value);
const targetRole = params.get('role') === 'target';
const previewStyle = computed(() => {
  const source = active.value;
  if (!source) return {};
  return {
    aspectRatio: source.aspect,
    width: props.initialSources
      ? `min(68vw, ${source.aspect * 60}vh${source.kind === 'screen' ? `, 640px, ${source.aspect * 350}px` : ''})`
      : `min(100vw, ${source.aspect * 100}vh)`,
  };
});
const finished = ref(false);
if (props.initialSources) state.value = { ...state.value, sources: props.initialSources, development: true };
const action = (value: SourcePickerAction) => {
  if (!props.initialSources) {
    send(value);
    return;
  }
  if (value.type === 'cancel' || value.type === 'confirm') {
    finished.value = true;
    return;
  }
  if (value.type === 'kind') {
    state.value = { ...state.value, kind: value.kind, selectedId: null, highlightedId: null };
    return;
  }
  if (value.type === 'hover' || value.type === 'select')
    state.value = {
      ...state.value,
      highlightedId: value.id,
      selectedId: value.type === 'select' ? value.id : state.value.selectedId,
    };
};
</script>

<template>
  <div v-if="active && !finished && (targetRole || initialSources)" class="target-backdrop" aria-hidden="true">
    <div class="target-window" :style="previewStyle"><SourceArtwork :source="active" live /></div>
  </div>
  <SourcePicker
    v-if="!targetRole && !finished"
    :state="state"
    :browser-preview="Boolean(initialSources)"
    @action="action"
  />
</template>

<style scoped>
.target-backdrop {
  position: fixed;
  z-index: 0;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.target-window {
  max-width: 100%;
  max-height: 100%;
  overflow: hidden;
  border-radius: var(--radius-md);
}
</style>
