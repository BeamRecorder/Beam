import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { i18n, setCurrentLocale } from '~/i18n';
import { SUPPORTED_LOCALES } from '~/i18n/locales';
import type { CaptureProject } from '~/api/types/capture-api';
import type { ProjectCardPreviewProps } from './project-picker-types';
import ProjectCardPreview from './ProjectCardPreview.vue';

enableAutoUnmount(afterEach);
const project = { id: 'demo', name: 'Demo', mode: 'studio', previewSrc: 'video://demo' } as CaptureProject;
const create = (patch: Partial<ProjectCardPreviewProps> = {}) =>
  mount(ProjectCardPreview, {
    props: {
      project,
      thumbnailSrc: 'image://demo',
      hovered: false,
      loaded: false,
      current: false,
      selected: false,
      selectionMode: false,
      ...patch,
    },
    attachTo: document.body,
  });

describe('project preview opening action', () => {
  it('opens once without selecting the card again or bubbling double-click and keyboard shortcuts', async () => {
    const wrapper = create();
    const parentClick = vi.fn(),
      parentDouble = vi.fn(),
      parentKey = vi.fn();
    wrapper.element.addEventListener('click', parentClick);
    wrapper.element.addEventListener('dblclick', parentDouble);
    wrapper.element.addEventListener('keydown', parentKey);
    const button = wrapper.get('.project-open-overlay button');
    expect(button.attributes('type')).toBe('button');
    expect(button.attributes('aria-label')).toBe('Open project');
    expect(button.attributes('tabindex')).not.toBe('-1');
    await button.trigger('click');
    await button.trigger('dblclick');
    await button.trigger('keydown', { key: 'Enter' });
    await button.trigger('keydown', { key: ' ' });
    expect(wrapper.emitted('open')).toEqual([[]]);
    expect(parentClick).not.toHaveBeenCalled();
    expect(parentDouble).not.toHaveBeenCalled();
    expect(parentKey).not.toHaveBeenCalled();
    await button.trigger('keydown', { key: 'ArrowDown' });
    expect(parentKey).toHaveBeenCalledOnce();
  });

  it('removes the opening action and status indicators during batch selection', async () => {
    const wrapper = create({ selectionMode: true, selected: true, current: true });
    expect(wrapper.find('button').exists()).toBe(false);
    expect(wrapper.find('.current-indicator').exists()).toBe(false);
    expect(wrapper.find('.selected-indicator').exists()).toBe(false);
    await wrapper.setProps({ selectionMode: false });
    expect(wrapper.get('.current-indicator').text()).toBe('Current');
    await wrapper.setProps({ current: false });
    expect(wrapper.find('.selected-indicator').exists()).toBe(true);
    await wrapper.setProps({ selected: false });
    expect(wrapper.find('.selected-indicator').exists()).toBe(false);
  });

  it('opens screenshot projects and missing thumbnails without requiring a preview video', async () => {
    const wrapper = create({ project: { ...project, mode: 'screenshot', previewSrc: null }, thumbnailSrc: null });
    expect(wrapper.find('video').exists()).toBe(false);
    expect(wrapper.find('.preview-skeleton').exists()).toBe(true);
    await wrapper.get('.project-open-overlay button').trigger('click');
    expect(wrapper.emitted('open')).toEqual([[]]);
  });

  it('mounts video only on hover and forwards readiness, clock updates and progress', async () => {
    const wrapper = create();
    expect(wrapper.find('video').exists()).toBe(false);
    await wrapper.setProps({ hovered: true });
    const video = wrapper.get('video');
    expect(video.attributes('src')).toBe(project.previewSrc);
    expect(video.classes()).not.toContain('is-loaded');
    await video.trigger('loadeddata');
    await video.trigger('playing');
    await video.trigger('timeupdate');
    expect(wrapper.emitted('loaded')).toHaveLength(2);
    expect(wrapper.emitted('timeupdate')?.[0]?.[0]).toBeInstanceOf(Event);
    await wrapper.setProps({ loaded: true, progress: { current: 2, total: 8 } });
    expect(video.classes()).toContain('is-loaded');
    expect(wrapper.find('.preview-progress-overlay').exists()).toBe(true);
    await wrapper.setProps({ hovered: false, progress: undefined });
    expect(wrapper.find('video').exists()).toBe(false);
    expect(wrapper.find('.preview-progress-overlay').exists()).toBe(false);
  });

  it.each(SUPPORTED_LOCALES)('uses the translated opening label in %s', async (locale) => {
    await setCurrentLocale(locale);
    const wrapper = create();
    const label = i18n.global.t('ProjectPicker.openProject');
    expect(label).not.toBe('ProjectPicker.openProject');
    expect(wrapper.get('.project-open-overlay button').text()).toBe(label);
    expect(wrapper.get('.project-open-overlay button').attributes('aria-label')).toBe(label);
  });
});
