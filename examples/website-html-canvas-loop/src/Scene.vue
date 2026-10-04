<script setup lang="ts">
import { computed, ref } from 'vue';
import { ArrowLeft, ChevronDown, Download, Scan } from '@lucide/vue';
import EditorTitlebar from '../../../apps/desktop/src/components/editor/EditorTitlebar.vue';
import EditorWorkspace from '../../../apps/desktop/src/components/editor/layout/EditorWorkspace.vue';
import TimelineToolbar from '../../../apps/desktop/src/components/editor/timeline/TimelineToolbar.vue';
import NativeTimeline from './NativeTimeline.vue';
import ZoomPanel from '../../../apps/desktop/src/components/editor/properties/zoom/ZoomPanel.vue';
import Button from '../../../apps/desktop/src/components/ui/button/Button.vue';
import beam from '../assets/beam.webp';
import { sceneState } from './scene-state';
import { cameraZooms } from './camera';
import { timelineDocument, playheadAt } from './timeline-model';
import type { ScenePose } from './scene-types';
import Artwork from './Artwork.vue';
import SourceEditor from './SourceEditor.vue';

const props = defineProps<{ pose: ScenePose }>();
const state = computed(() => sceneState(props.pose.clock));
const zooms = cameraZooms();
const composition = timelineDocument();
const nativeTimeline = ref<InstanceType<typeof NativeTimeline> | null>(null);
defineExpose({ ready: () => nativeTimeline.value!.ready });
const playhead = computed(() => playheadAt(props.pose.clock));
const selected = computed(() => zooms[props.pose.clock >= 4.8 && props.pose.clock < 11.2 ? 1 : 0]!);
</script>

<template>
  <div class="world">
    <div class="caption">
      <span>{{ state.phase }}</span
      ><span class="caption-note">HTML → Beam</span>
    </div>
    <div class="editor-window" inert>
      <EditorTitlebar>
        <template #left
          ><img class="brand" :src="beam" alt="Beam" /><Button variant="ghost" size="xs" :icon="ArrowLeft">Back</Button
          ><Button variant="secondary" size="xs" :icon-right="ChevronDown">Default</Button></template
        >
        <template #center><span class="project-name">Your canvas can be code</span><ChevronDown :size="12" /></template>
        <template #right><Button variant="primary" size="sm" :icon="Download">Export</Button></template>
      </EditorTitlebar>
      <EditorWorkspace kind="video">
        <SourceEditor :state="state" :clock="pose.clock" />
        <div class="canvas-column">
          <div class="canvas-preview-stage">
            <div class="canvas-island">
              <div class="artwork-fit"><Artwork :state="state" /></div>
            </div>
          </div>
        </div>
        <aside class="native-inspector">
          <h2><Scan :size="15" />Zoom</h2>
          <ZoomPanel
            data-layout-allow-overflow="true"
            data-layout-allow-occlusion="true"
            :selected-zoom="selected"
            :can-generate="false"
            :has-automatic-zooms="false"
            :motion-blur="{ enabled: false, intensity: 0 }"
            :canvas-size="{ width: 1280, height: 800 }"
          />
        </aside>
        <template #after-upper>
          <TimelineToolbar
            :current-time="playhead"
            :duration="12"
            :is-playing="false"
            :zoom-level="100"
            :can-split="true"
            :can-undo="state.saved"
          />
          <div class="timeline">
            <NativeTimeline
              ref="nativeTimeline"
              :current-time="playhead"
              :zooms="zooms"
              :selected-zoom="selected.id"
              :composition="composition"
            />
          </div>
        </template>
      </EditorWorkspace>
    </div>
  </div>
</template>
