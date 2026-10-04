import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setCurrentLocale } from '~/i18n';
import ProjectTitle from './ProjectTitle.vue';
import ProjectModeIcon from './ProjectModeIcon.vue';
import CaptureModeIcon from '../capture/CaptureModeIcon.vue';
import type { ProjectIdentity } from './project-picker-types';

enableAutoUnmount(afterEach);
const project: ProjectIdentity = { id: 'project', name: 'Beam — Beautiful captures', mode: 'screenshot' };

describe('project title and mode icon', () => {
  it('keeps the full name accessible and the visible label separate from its rename control', () => {
    const wrapper = mount(ProjectTitle, { props: { project, selectionMode: false } });
    const button = wrapper.get('button');
    expect(button.attributes('title')).toBe(project.name);
    expect(button.attributes('aria-label')).toBe(`Rename: ${project.name}`);
    expect(button.get('.project-name-label').text()).toBe(project.name);
    expect(wrapper.findAll('button')).toHaveLength(1);
  });

  it('renames on activation and isolates editing keys from project-card shortcuts', async () => {
    const wrapper = mount(ProjectTitle, { props: { project, selectionMode: false } });
    const parentKeydown = vi.fn();
    wrapper.element.addEventListener('keydown', parentKeydown);
    const button = wrapper.get('button');
    await button.trigger('click');
    await button.trigger('dblclick');
    expect(wrapper.emitted('rename')).toEqual([[]]);
    await button.trigger('keydown', { key: 'Enter' });
    await button.trigger('keydown', { key: ' ' });
    expect(parentKeydown).not.toHaveBeenCalled();
    await button.trigger('keydown', { key: 'ArrowDown' });
    expect(parentKeydown).toHaveBeenCalledOnce();
    button.element.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    expect(wrapper.emitted('rename')).toEqual([[], []]);
  });

  it('keeps batch-selection titles passive and updates renamed and translated labels', async () => {
    const wrapper = mount(ProjectTitle, { props: { project, selectionMode: true } });
    expect(wrapper.find('button').exists()).toBe(false);
    expect(wrapper.get('span.project-card-name').text()).toBe(project.name);
    await wrapper.trigger('click');
    expect(wrapper.emitted('rename')).toBeUndefined();
    const renamed = { ...project, name: 'Capture <1> & «démo»' };
    await wrapper.setProps({ project: renamed, selectionMode: false });
    await setCurrentLocale('fr');
    expect(wrapper.get('.project-name-label').text()).toBe(renamed.name);
    expect(wrapper.get('button').attributes('aria-label')).toBe(`Renommer: ${renamed.name}`);
    expect(wrapper.findAll('.project-name-label').length).toBe(1);
  });

  it.each(['studio', 'screenshot', 'instant'] as const)(
    'retains the original %s project icon and accessible name',
    (mode) => {
      const wrapper = mount(ProjectModeIcon, { props: { mode } });
      expect(wrapper.getComponent(CaptureModeIcon).props()).toMatchObject({ mode, size: 16 });
      expect(wrapper.attributes('data-mode')).toBe(mode);
      expect(wrapper.attributes('role')).toBe('img');
      expect(wrapper.classes()).toContain('project-mode-icon');
      expect(wrapper.classes()).toContain(mode);
    },
  );

  it('defaults projects without a mode to the Studio icon', () => {
    const wrapper = mount(ProjectModeIcon);
    expect(wrapper.getComponent(CaptureModeIcon).props('mode')).toBe('studio');
  });
});
