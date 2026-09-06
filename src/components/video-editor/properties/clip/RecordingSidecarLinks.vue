<script setup lang="ts">
import { computed } from 'vue';
import { Link, Unlink, Video, ZoomIn } from '@lucide/vue';
import Button from '~/components/ui/button/Button.vue';
import Popover from '~/components/ui/popover/Popover.vue';
import Divider from '~/components/ui/divider/Divider.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { ClipComposition } from '~/media/shared/composition-types';
import type { ZoomElement } from '../../zoom/zoom-types';
import { ZOOM_DEPTH_SCALES } from '../../zoom/zoom-types';
import { recordingSidecars } from '../../composition/recording-sidecars';
import type { RecordingSidecarUnlink } from '../../composition/recording-sidecar-types';
const props = defineProps<{ clipId?: string; composition: ClipComposition; zooms: ZoomElement[] }>();
const emit = defineEmits<{ unlink: [request: RecordingSidecarUnlink] }>();
const { t } = useTranslate('RecordingSidecarLinks');
const { t: tTimeline } = useTranslate('TimelineTracks');
const linked = computed(() => recordingSidecars(props.composition, props.zooms, props.clipId ?? ''));
const unlink = (clipIds: string[], zoomIds: string[]) => {
  if (props.clipId) emit('unlink', { clipId: props.clipId, clipIds, zoomIds });
};
</script>
<template>
  <div v-if="linked.clips.length || linked.zooms.length" class="sidecar-links">
    <Divider spacing="xs" />
    <Popover align="right" :match-trigger-width="false">
      <template #trigger>
        <Button variant="outline" size="sm" :icon="Link">{{ t('title') }}</Button>
      </template>
      <template #default="{ close }">
        <div class="sidecar-popover">
          <p>{{ t('description') }}</p>
          <div v-for="clip in linked.clips" :key="clip.id" class="sidecar-row">
            <Video :size="16" aria-hidden="true" />
            <span>{{ clip.name }}</span>
            <Button
              variant="ghost"
              size="xs"
              :icon="Unlink"
              :disabled="Boolean(clip.locked)"
              :aria-label="t('unlinkOne', { name: clip.name })"
              @click="unlink([clip.id], [])"
              >{{ t('unlink') }}</Button
            >
          </div>
          <div v-for="zoom in linked.zooms" :key="zoom.id" class="sidecar-row">
            <ZoomIn :size="16" aria-hidden="true" />
            <span
              >{{ tTimeline('zoomTitle', { level: ZOOM_DEPTH_SCALES[zoom.depth] }) }} ·
              {{ (zoom.startMs / 1000).toFixed(1) }}s</span
            >
            <Button
              variant="ghost"
              size="xs"
              :icon="Unlink"
              :disabled="Boolean(zoom.locked)"
              :aria-label="t('unlinkOne', { name: tTimeline('zoomTitle', { level: ZOOM_DEPTH_SCALES[zoom.depth] }) })"
              @click="unlink([], [zoom.id])"
              >{{ t('unlink') }}</Button
            >
          </div>
          <Button
            variant="secondary"
            size="sm"
            block
            :disabled="linked.clips.some((clip) => clip.locked) || linked.zooms.some((zoom) => zoom.locked)"
            @click="
              unlink(
                linked.clips.map((clip) => clip.id),
                linked.zooms.map((zoom) => zoom.id),
              );
              close();
            "
            >{{ t('unlinkAll') }}</Button
          >
        </div>
      </template>
    </Popover>
  </div>
</template>
<style scoped>
.sidecar-links {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sidecar-popover {
  width: min(340px, calc(100vw - 32px));
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: min(420px, 70vh);
  overflow-y: auto;
}
.sidecar-popover p {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}
.sidecar-row {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 12px;
}
.sidecar-row > span {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.sidecar-row > svg {
  flex-shrink: 0;
  color: var(--text-muted);
}
</style>
