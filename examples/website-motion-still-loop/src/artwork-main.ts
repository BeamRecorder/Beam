import { createApp, reactive } from 'vue';
import Artwork from './Artwork.vue';
import { registerComposition } from './runtime';
import './style.css';
const pose = reactive({ clock: 0 });
createApp(Artwork).mount('#app');
registerComposition(pose, 'artwork', false);
