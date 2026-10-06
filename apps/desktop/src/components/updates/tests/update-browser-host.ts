import { createApp, h } from 'vue';
import TopbarHUD from '~/components/hud/TopbarHUD.vue';
import UpdateControls from '../UpdateControls.vue';
import { i18n, setCurrentLocale } from '~/i18n';
import '~/style.css';

Object.assign(window, { setUpdateLocale: setCurrentLocale });
createApp({
  render: () =>
    h('main', { style: { margin: '16px', width: '640px', height: '236px', background: 'var(--color-bg-element)' } }, [
      h(TopbarHUD),
      h('div', { style: { padding: '24px' } }, [h(UpdateControls, { showIcon: true })]),
    ]),
})
  .use(i18n)
  .mount('#app');
