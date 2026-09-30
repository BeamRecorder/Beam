<script setup lang="ts">
import { ref } from 'vue';
import type {
  SourcePickerAction,
  SourcePickerKind,
  SourcePickerRole,
  SourcePickerSource,
} from '~/api/types/source-picker';
import { useSourcePicker } from './useSourcePicker';
import SourcePicker from './SourcePicker.vue';
import SourceArtwork from './SourceArtwork.vue';
import SourcePickerAura from './SourcePickerAura.vue';

const params = new URLSearchParams(location.search);
const props = defineProps<{ initialSources?: SourcePickerSource[] }>();
const role: SourcePickerRole =
  params.get('role') === 'aura' ? 'aura' : params.get('role') === 'target' ? 'target' : 'chooser';
const kind: SourcePickerKind = params.get('kind') === 'screen' ? 'screen' : 'window';
const { state, highlighted, selected, send } = useSourcePicker(kind);
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
  <SourcePickerAura
    v-if="role === 'aura' && (selected || highlighted)"
    :screen="(selected || highlighted)?.kind === 'screen'"
  />
  <div v-else-if="role === 'target' && highlighted" class="native-target">
    <SourceArtwork :source="highlighted" live />
  </div>
  <SourcePicker
    v-else-if="role === 'chooser' && !finished"
    :state="state"
    :browser-preview="Boolean(initialSources)"
    @action="action"
  />
</template>

<style scoped>
.native-target {
  width: 100vw;
  height: 100vh;
  border-radius: var(--radius-md);
  overflow: hidden;
}
</style>
