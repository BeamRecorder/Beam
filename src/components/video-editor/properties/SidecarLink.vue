<script setup lang="ts">
import { ChevronDown, Link2, Mic, Unlink, Video, Volume2 } from "@lucide/vue";
import Popover from "~/ui/popover/Popover.vue";
import Button from "~/ui/button/Button.vue";
import { useTranslate } from "~/i18n/useTranslate";
import type { SidecarLinkDescriptor } from "../composition/sidecar-links";

const { t } = useTranslate("SidecarLink");
defineProps<{ links: SidecarLinkDescriptor[] }>();
const emit = defineEmits<{
  (e: "select", link: SidecarLinkDescriptor): void;
  (e: "unlink", link: SidecarLinkDescriptor): void;
}>();

const iconFor = (kind: SidecarLinkDescriptor["kind"]) =>
  kind === "system-audio" ? Volume2 : kind === "microphone" ? Mic : Video;
</script>

<template>
  <div class="sidecar-link">
    <span class="sidecar-label"><Link2 :size="14" />{{ t('sidecarLink') }}</span>
    <Popover align="right" :match-trigger-width="false">
      <template #trigger>
        <Button variant="outline" size="sm" :aria-label="t('linkedTracks')">
          {{ t('linkedTracks') }} <ChevronDown :size="14" />
        </Button>
      </template>
      <template #default="{ close }">
        <div class="sidecar-popover">
          <p class="popover-title">{{ t('linkedTracks') }}</p>
          <p v-if="!links.length" class="empty">{{ t('noLinkedTracks') }}</p>
          <div v-for="link in links" :key="link.id" class="sidecar-row">
            <button type="button" class="sidecar-target" @click="emit('select', link); close()">
              <component :is="iconFor(link.kind)" :size="16" />
              <span>{{ link.name }}</span>
              <small>{{ link.enabled ? t('enabled') : t('disabled') }}</small>
            </button>
            <Button variant="ghost" size="xs" :icon="Unlink" :aria-label="t('unlink', { name: link.name })" @click.stop="emit('unlink', link)" />
          </div>
        </div>
      </template>
    </Popover>
  </div>
</template>

<style scoped>
.sidecar-link, .sidecar-label, .sidecar-target, .sidecar-row { display: flex; align-items: center; }
.sidecar-link { justify-content: space-between; gap: 8px; }
.sidecar-label { gap: 6px; color: var(--text-primary); font-size: 12px; font-weight: 600; }
.sidecar-popover { min-width: 260px; padding: 8px; }
.popover-title { margin: 0 0 6px; color: var(--text-primary); font-size: 12px; font-weight: 700; }
.sidecar-row { gap: 4px; justify-content: space-between; }
.sidecar-target { min-width: 0; flex: 1; gap: 8px; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--text-primary); padding: 7px; text-align: left; cursor: pointer; }
.sidecar-target:hover { background: var(--color-bg-hover); }
.sidecar-target span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sidecar-target small { margin-left: auto; color: var(--text-muted); font-size: 10px; }
.empty { margin: 0; color: var(--text-muted); font-size: 12px; }
</style>
