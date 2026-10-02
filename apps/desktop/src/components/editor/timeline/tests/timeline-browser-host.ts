// Browser-only fixture keeps framework imports on the same Vite module graph as the component.
import '../../../../style.css';
export { createApp, h, reactive, nextTick } from 'vue';
export { createPinia } from 'pinia';
export { i18n } from '../../../../i18n';
export { default as Timeline } from '../TimelineTracks.vue';
