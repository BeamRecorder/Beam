<script setup lang="ts">
import { inject } from 'vue';
import { useTranslate } from '~/i18n/useTranslate';
import TrackPropertyToggle from '../TrackPropertyToggle.vue';
import { clipTrackPropertyScopeKey } from './clip-track-property-context';
const scope = inject(clipTrackPropertyScopeKey, null);
const { t } = useTranslate('ClipPropertiesPanel');
</script>
<template>
  <TrackPropertyToggle :scope="scope" :hint="t('applyToTrackHint')" />
</template>
