import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { i18n, setCurrentLocale } from '~/i18n';
import { SUPPORTED_LOCALES } from '~/i18n/locales';
import CaptureModeGroup from '../hud/CaptureModeGroup.vue';
import ProjectCreateDialog from './ProjectCreateDialog.vue';

enableAutoUnmount(afterEach);
beforeEach(() => setCurrentLocale('en'));
afterEach(() => setCurrentLocale('en'));
const create = (busy = false) =>
  mount(ProjectCreateDialog, {
    props: { open: true, name: '', mode: 'studio', busy, error: '' },
    global: {
      stubs: {
        Dialog: {
          props: ['isOpen'],
          template: '<div v-if="isOpen"><slot/><slot name="footer" :close="() => $emit(\'close\')"/></div>',
        },
      },
    },
  });

it.each(SUPPORTED_LOCALES)('shows Video then Screenshot, fully translated in %s, using Beam assets', async (locale) => {
  await setCurrentLocale(locale);
  const wrapper = create();
  const keys = [
    'QuickSnipCropBar.video',
    'QuickSnipCropBar.screenshot',
    'QuickSnipCropBar.mode',
    'ProjectPicker.newProject',
    'ProjectPicker.projectName',
    'ProjectPicker.cancel',
    'ProjectPicker.create',
  ];
  for (const key of keys) {
    expect(i18n.global.te(key, locale)).toBe(true);
    expect(i18n.global.t(key)).not.toBe(key);
    expect(i18n.global.t(key).trim()).not.toBe('');
  }
  const group = wrapper.get('[role="group"]');
  expect(group.findAll('button').map((button) => button.text())).toEqual([
    i18n.global.t('QuickSnipCropBar.video'),
    i18n.global.t('QuickSnipCropBar.screenshot'),
  ]);
  expect(group.findAll('button').map((button) => button.attributes('aria-label'))).toEqual([
    i18n.global.t('QuickSnipCropBar.video'),
    i18n.global.t('QuickSnipCropBar.screenshot'),
  ]);
  expect(group.findAll('.capture-mode-icon').map((icon) => icon.attributes('style'))).toEqual([
    expect.stringContaining('beam-recorder.svg'),
    expect.stringContaining('beam-screenshot.svg'),
  ]);
  expect(group.attributes('style')).toContain('--button-group-columns: 2');
  expect(group.findAll('[title]')).toHaveLength(0);
});
it('updates the active choice without introducing Instant', async () => {
  const wrapper = create();
  await wrapper.get('[aria-label="Screenshot"]').trigger('click');
  expect(wrapper.emitted('update:mode')).toEqual([['screenshot']]);
  await wrapper.setProps({ mode: 'screenshot' });
  expect(wrapper.get('[aria-label="Screenshot"]').attributes('aria-pressed')).toBe('true');
  expect(wrapper.get('[aria-label="Video"]').attributes('aria-pressed')).toBe('false');
  await wrapper.get('[aria-label="Video"]').trigger('click');
  expect(wrapper.emitted('update:mode')?.at(-1)).toEqual(['studio']);
  wrapper.getComponent(CaptureModeGroup).vm.$emit('update:modelValue', 'instant');
  expect(wrapper.emitted('update:mode')).toHaveLength(2);
});
it('updates the name and submits through Enter or the Create button', async () => {
  const wrapper = create();
  await wrapper.get('input').setValue('My screenshot');
  expect(wrapper.emitted('update:name')).toEqual([['My screenshot']]);
  await wrapper.get('form').trigger('submit');
  await wrapper
    .findAll('button')
    .find((button) => button.text() === 'Create')!
    .trigger('click');
  expect(wrapper.emitted('create')).toHaveLength(2);
});
it('blocks selection and submission while busy and shows storage errors', async () => {
  const wrapper = create(true);
  await wrapper.setProps({ error: 'Could not save' });
  expect(wrapper.get('[role="alert"]').text()).toBe('Could not save');
  expect(wrapper.get('input').element.disabled).toBe(true);
  for (const button of wrapper.findAll('button')) {
    expect(button.element.disabled).toBe(true);
    await button.trigger('click');
  }
  await wrapper.get('form').trigger('submit');
  expect(wrapper.emitted('create')).toBeUndefined();
  expect(wrapper.emitted('update:mode')).toBeUndefined();
});
it('closes the dialog on Cancel', async () => {
  const wrapper = create();
  await wrapper
    .findAll('button')
    .find((button) => button.text() === 'Cancel')!
    .trigger('click');
  expect(wrapper.emitted('update:open')).toEqual([[false]]);
});
