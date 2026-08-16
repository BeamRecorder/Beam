import { createApp } from 'vue';
import App from './App.vue';
import { websiteI18n } from './i18n';
import './styles/tokens.css';
import './styles/global.css';

const app = createApp(App);
app.use(websiteI18n);
app.mount('#app');
