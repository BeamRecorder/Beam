import { createApp, reactive } from 'vue';
import Scene from './Scene.vue';
import { registerComposition } from './runtime';
import './style.css';
const pose = reactive({ clock: 0 });
createApp(Scene, { pose }).mount('#app');
registerComposition(pose, 'motion-still', true);
