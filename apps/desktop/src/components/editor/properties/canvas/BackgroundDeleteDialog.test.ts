import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import BackgroundDeleteDialog from './BackgroundDeleteDialog.vue';
import ConfirmDialog from '~/ui/dialog/ConfirmDialog.vue';
import { BACKGROUND_GRADIENTS } from '../../composables/backgroundCatalog';
import { SUPPORTED_LOCALES } from '~/i18n/locales';
import { i18n, setCurrentLocale } from '~/i18n';
import type { BackgroundValue } from '@beam/engine/shared/background-types';
const wrappers: Array<{ unmount: () => void }> = [];
const image: BackgroundValue = {
  kind: 'image',
  id: 'user-wallpaper:image:file.png',
  name: 'My photo',
  path: 'project-media://background/image/file.png',
  extension: 'png',
};
const render = (target: BackgroundValue | null, preview?: string) => {
  const wrapper = mount(BackgroundDeleteDialog, {
    props: { target, preview, busy: false, error: '' },
    global: { stubs: { Dialog: { template: '<div><slot /><slot name="footer" /></div>' } } },
  });
  wrappers.push(wrapper);
  return wrapper;
};
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()));
describe('background deletion confirmation', () => {
  it('uses a destructive confirmation and shows the exact image, name and an optional poster', async () => {
    const wrapper = render(image);
    expect(wrapper.get('img').attributes('src')).toBe(image.path);
    expect(wrapper.get('figcaption').text()).toBe(image.name);
    expect(wrapper.findComponent(ConfirmDialog).props('destructive')).toBe(true);
    await wrapper.setProps({ preview: 'blob:thumbnail' });
    expect(wrapper.get('img').attributes('src')).toBe('blob:thumbnail');
    wrapper.findComponent(ConfirmDialog).vm.$emit('confirm');
    wrapper.findComponent(ConfirmDialog).vm.$emit('close');
    expect(wrapper.emitted('confirm')).toHaveLength(1);
    expect(wrapper.emitted('close')).toHaveLength(1);
  });
  it('previews real video media with a poster and shows errors without dropping its name', async () => {
    const wrapper = render({ ...image, kind: 'video', extension: 'mp4' }, 'blob:poster');
    expect(wrapper.get('video').attributes()).toMatchObject({
      src: image.path,
      poster: 'blob:poster',
      preload: 'metadata',
      'aria-label': image.name,
    });
    await wrapper.setProps({ busy: true, error: 'Disk write failed' });
    expect(wrapper.get('[role="alert"]').text()).toBe('Disk write failed');
    expect(wrapper.findComponent(ConfirmDialog).props('busy')).toBe(true);
  });
  it('shows actual colors and gradients, and hides the preview when no deletion is pending', async () => {
    const wrapper = render({ kind: 'color', id: 'color:#123456', color: '#123456', name: 'Blue' });
    expect(wrapper.get('.deletion-swatch span').attributes('style')).toContain('rgb(18, 52, 86)');
    await wrapper.setProps({ target: BACKGROUND_GRADIENTS[0] });
    expect(wrapper.get('.deletion-swatch span').attributes('style')).toContain('linear-gradient');
    await wrapper.setProps({ target: null });
    expect(wrapper.find('figure').exists()).toBe(false);
    expect(wrapper.findComponent(ConfirmDialog).props('isOpen')).toBe(false);
  });
  it.each(SUPPORTED_LOCALES)('translates confirmation, destruction scope and undo/redo in %s', async (locale) => {
    await setCurrentLocale(locale);
    const wrapper = render(image);
    for (const key of ['title', 'description', 'delete', 'cancel', 'undo', 'redo', 'error', 'loadError'])
      expect(i18n.global.te(`BackgroundDeletion.${key}`, locale)).toBe(true);
    expect(wrapper.findComponent(ConfirmDialog).props('title')).toBe(i18n.global.t('BackgroundDeletion.title'));
    expect(wrapper.findComponent(ConfirmDialog).props('description')).toBe(
      i18n.global.t('BackgroundDeletion.description'),
    );
  });
});
