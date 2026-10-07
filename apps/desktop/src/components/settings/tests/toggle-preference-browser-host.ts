import { createApp, h, nextTick, ref } from 'vue';
import TogglePreference from '../TogglePreference.vue';
import { i18n, initI18n } from '~/i18n';
import '~/style.css';

const enabled = ref(false);
const busy = ref(false);
let requested = false;
let saves = 0;
await initI18n();
createApp({
  render: () =>
    h('main', { style: { padding: '24px', width: '560px' } }, [
      h(TogglePreference, {
        label: i18n.global.t('HudPreferences.minimizeToTray'),
        description: i18n.global.t('HudPreferences.minimizeToTrayDescription'),
        modelValue: enabled.value,
        busy: busy.value,
        'onUpdate:modelValue': (value: boolean) => {
          if (busy.value) throw new Error('Duplicate save');
          busy.value = true;
          requested = value;
          saves++;
        },
      }),
    ]),
})
  .use(i18n)
  .mount('#app');
Object.assign(window, {
  toggleTest: {
    saves: () => saves,
    async finish() {
      enabled.value = requested;
      busy.value = false;
      await nextTick();
    },
  },
});
