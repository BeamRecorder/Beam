import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureMock as capture } from './capture.mock';

vi.mock('../../../api/capture', async () => ({ capture: (await import('./capture.mock')).captureMock }));
import ProjectPicker from '../ProjectPicker.vue';

const projects = [
  { id: 'one', name: 'First', createdAt: '', updatedAt: '2025-01-01T00:00:00.000Z', sessionCount: 1, previewSrc: null },
  { id: 'two', name: 'Second', createdAt: '', updatedAt: 'invalid', sessionCount: 2, previewSrc: null },
];
const stubs = {
  Dialog: { template: '<div><slot /><slot name="footer" :close="() => {}" /></div>' },
  Popover: { template: '<div><slot name="trigger" :isOpen="false" /><slot :close="() => {}" /></div>' },
};
const settle = async () => {
  await flushPromises();
  await vi.advanceTimersByTimeAsync(300);
  await flushPromises();
};

describe('ProjectPicker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    capture.listProjects.mockReset();
    capture.createProject.mockReset();
    capture.renameProject.mockReset();
    capture.deleteProject.mockReset();
  });
  afterEach(() => vi.useRealTimers());
  it('loads projects, uses current selection and opens it', async () => {
    capture.listProjects.mockResolvedValue(projects);
    const wrapper = mount(ProjectPicker, { props: { currentProjectId: 'two' }, global: { stubs } });
    await settle();
    expect(wrapper.text()).toContain('First');
    expect(wrapper.text()).toContain('Unknown date');
    expect(wrapper.findAll('.project-card')[1]?.find('.current-indicator').exists()).toBe(true);
    await wrapper.findAll('.project-card')[0]?.trigger('click');
    const open = wrapper.findAll('button').find((button) => button.text().includes('Open project'));
    await open?.trigger('click');
    expect(wrapper.emitted('open-project')).toEqual([[projects[0]]]);
  });
  it('shows a recoverable loading error and retries', async () => {
    capture.listProjects.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([]);
    const wrapper = mount(ProjectPicker, { global: { stubs } });
    await settle();
    expect(wrapper.get('[role=alert]').text()).toContain('offline');
    await wrapper.get('[role=alert] button').trigger('click');
    await settle();
    expect(wrapper.text()).toContain('No projects yet.');
  });
  it('emits compact selection and creates a new project', async () => {
    capture.listProjects.mockResolvedValue(projects);
    capture.createProject.mockResolvedValue(projects[0]);
    const wrapper = mount(ProjectPicker, { props: { compact: true }, global: { stubs } });
    await settle();
    await wrapper.get('.project-card').trigger('click');
    expect(wrapper.emitted('select-project')).toEqual([[projects[0]]]);
    await wrapper.get('[aria-label="New project"]').trigger('click');
    const input = wrapper.find('input');
    await input.setValue('  New  ');
    const create = wrapper.findAll('button').find((button) => button.text() === 'Create');
    await create?.trigger('click');
    await settle();
    expect(capture.createProject).toHaveBeenCalledWith({ name: 'New' });
    expect(wrapper.emitted('open-project')).toEqual([[projects[0]]]);
  });
  it('renames a project, rejects unchanged names, and handles rename failure', async () => {
    capture.listProjects.mockResolvedValue(projects);
    capture.renameProject.mockResolvedValue(projects[0]);
    const wrapper = mount(ProjectPicker, { global: { stubs } });
    await settle();
    const findRename = () => wrapper.findAll('button').find((button) => button.text() === 'Rename');
    await findRename()?.trigger('click');
    await vi.advanceTimersByTimeAsync(300);
    const input = () => wrapper.findAll('.input-element')[0];
    await input().setValue(' Renamed ');
    await input().trigger('keydown', { key: 'Enter' });
    await settle();
    expect(capture.renameProject).toHaveBeenCalledWith('one', 'Renamed');
    await findRename()?.trigger('click');
    await vi.advanceTimersByTimeAsync(300);
    await input().trigger('keydown', { key: 'Enter' });
    expect(capture.renameProject).toHaveBeenCalledTimes(1);
    capture.renameProject.mockRejectedValueOnce(new Error('rename blocked'));
    await findRename()?.trigger('click');
    await vi.advanceTimersByTimeAsync(300);
    await input().setValue('Blocked');
    await input().trigger('keydown', { key: 'Enter' });
    await settle();
    expect(wrapper.findAll('.input-element')).toHaveLength(1);
  });
  it('deletes a selected project and selects the next remaining project', async () => {
    capture.listProjects.mockResolvedValueOnce(projects).mockResolvedValueOnce([projects[1]]);
    capture.deleteProject.mockResolvedValue(undefined);
    const wrapper = mount(ProjectPicker, { props: { compact: true, currentProjectId: 'one' }, global: { stubs } });
    await settle();
    const remove = wrapper.findAll('button').find((button) => button.text() === 'Delete');
    await remove?.trigger('click');
    await wrapper.vm.$nextTick();
    await wrapper.get('button.btn-danger').trigger('click');
    await settle();
    expect(capture.deleteProject).toHaveBeenCalledWith('one');
    expect(wrapper.text()).toContain('Second');
  });
  it('keeps video preview progress and resets it after mouse leave', async () => {
    const preview = { ...projects[0], previewSrc: 'file:///preview.mp4' };
    capture.listProjects.mockResolvedValue([preview]);
    const wrapper = mount(ProjectPicker, { global: { stubs } });
    await settle();
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    await wrapper.get('.project-card').trigger('mouseenter');
    await wrapper.vm.$nextTick();
    const video = wrapper.get('video').element as HTMLVideoElement;
    Object.defineProperty(video, 'duration', { value: 2 });
    Object.defineProperty(video, 'currentTime', { value: 1, writable: true });
    video.pause = vi.fn();
    await wrapper.get('video').trigger('timeupdate');
    expect(wrapper.find('.preview-progress-overlay').exists()).toBe(true);
    await wrapper.get('.project-card').trigger('mouseleave');
    expect(video.pause).toHaveBeenCalledOnce();
    expect(video.currentTime).toBe(0.1);
  });
  it('renders content badges for screen recording, camera, and captions based on project features', async () => {
    const featuredProjects = [
      {
        id: 'full',
        name: 'Full Feature',
        createdAt: '',
        updatedAt: '2025-01-01T00:00:00.000Z',
        sessionCount: 1,
        previewSrc: null,
        hasScreen: true,
        hasCamera: true,
        hasCaption: true,
      },
      {
        id: 'screen-only',
        name: 'Screen Only',
        createdAt: '',
        updatedAt: '2025-01-01T00:00:00.000Z',
        sessionCount: 1,
        previewSrc: null,
        hasScreen: true,
        hasCamera: false,
        hasCaption: false,
      },
      {
        id: 'none',
        name: 'Empty Project',
        createdAt: '',
        updatedAt: '2025-01-01T00:00:00.000Z',
        sessionCount: 0,
        previewSrc: null,
        hasScreen: false,
        hasCamera: false,
        hasCaption: false,
      },
    ];
    capture.listProjects.mockResolvedValue(featuredProjects);
    const wrapper = mount(ProjectPicker, { global: { stubs } });
    await settle();

    const cards = wrapper.findAll('.project-card');
    expect(cards).toHaveLength(3);

    // Card 0: full features
    const firstBadges = cards[0].find('[data-testid="project-badges"]');
    expect(firstBadges.exists()).toBe(true);
    expect(firstBadges.find('[aria-label="Screen recording"]').exists()).toBe(true);
    expect(firstBadges.find('[aria-label="Camera"]').exists()).toBe(true);
    expect(firstBadges.find('[aria-label="Captions"]').exists()).toBe(true);

    // Card 1: screen only
    const secondBadges = cards[1].find('[data-testid="project-badges"]');
    expect(secondBadges.exists()).toBe(true);
    expect(secondBadges.find('[aria-label="Screen recording"]').exists()).toBe(true);
    expect(secondBadges.find('[aria-label="Camera"]').exists()).toBe(false);
    expect(secondBadges.find('[aria-label="Captions"]').exists()).toBe(false);

    // Card 2: none
    const thirdBadges = cards[2].find('[data-testid="project-badges"]');
    expect(thirdBadges.exists()).toBe(false);
  });
  it('toggles search, filters projects in real time, and shows search empty state', async () => {
    capture.listProjects.mockResolvedValue(projects);
    const wrapper = mount(ProjectPicker, { global: { stubs } });
    await settle();

    expect(wrapper.findAll('.project-card')).toHaveLength(2);
    expect(wrapper.find('.project-search-bar').exists()).toBe(false);

    // Open search
    await wrapper.get('button[aria-label="Search projects"]').trigger('click');
    await settle();
    expect(wrapper.find('.project-search-bar').exists()).toBe(true);

    // Filter by "First"
    const searchInput = wrapper.get('.project-search-bar input');
    await searchInput.setValue('First');
    await settle();
    expect(wrapper.findAll('.project-card')).toHaveLength(1);
    expect(wrapper.text()).toContain('First');
    expect(wrapper.text()).not.toContain('Second');

    // Filter with no match
    await searchInput.setValue('NonExistent');
    await settle();
    expect(wrapper.findAll('.project-card')).toHaveLength(0);
    expect(wrapper.text()).toContain('No projects match your search.');

    // Clear search via clear button
    const clearBtn = wrapper.findAll('button').find((b) => b.text().includes('Clear search'));
    await clearBtn?.trigger('click');
    await settle();
    expect(wrapper.findAll('.project-card')).toHaveLength(2);
  });
  it('shows success checkmark feedback when refresh is clicked', async () => {
    capture.listProjects.mockResolvedValue(projects);
    const wrapper = mount(ProjectPicker, { global: { stubs } });
    await settle();

    const refreshBtn = wrapper.get('button.refresh-button');
    expect(refreshBtn.classes()).not.toContain('is-success');

    await refreshBtn.trigger('click');
    await flushPromises();
    expect(refreshBtn.classes()).toContain('is-success');
    expect(refreshBtn.attributes('aria-label')).toBe('Projects refreshed');

    // After timer expires, success state resets
    await vi.advanceTimersByTimeAsync(1700);
    await wrapper.vm.$nextTick();
    expect(refreshBtn.classes()).not.toContain('is-success');
  });
  it('supports multi-selection mode with checkboxes in front of project titles and batch delete', async () => {
    capture.listProjects.mockResolvedValue(projects);
    capture.deleteProject.mockResolvedValue(undefined);
    const wrapper = mount(ProjectPicker, { global: { stubs } });
    await settle();

    // Initially selection mode is not active
    expect(wrapper.find('.project-selection-bar').exists()).toBe(false);
    expect(wrapper.findAll('.project-title-checkbox')).toHaveLength(0);

    // Toggle selection mode via header button
    const selectToggleBtn = wrapper.get('.select-toggle-button');
    await selectToggleBtn.trigger('click');
    await settle();

    // Selection bar is visible, checkboxes exist in front of project titles
    expect(wrapper.find('.project-selection-bar').exists()).toBe(true);
    const titleCheckboxes = wrapper.findAll('.project-title-checkbox');
    expect(titleCheckboxes).toHaveLength(2);

    // Click first project card to select it
    await wrapper.findAll('.project-card')[0].trigger('click');
    await settle();
    expect(wrapper.find('.selection-bar-right button.btn-danger').text()).toContain('Delete (1)');

    // Select all via selection bar checkbox
    const selectAllCheckbox = wrapper.find('.selection-bar-left .checkbox-container');
    await selectAllCheckbox.trigger('click');
    await settle();
    expect(wrapper.find('.selection-bar-right button.btn-danger').text()).toContain('Delete (2)');

    // Delete batch
    const deleteBatchBtn = wrapper.get('.selection-bar-right button.btn-danger');
    await deleteBatchBtn.trigger('click');
    await settle();

    expect(capture.deleteProject).toHaveBeenCalledWith('one');
    expect(capture.deleteProject).toHaveBeenCalledWith('two');
    expect(wrapper.find('.project-selection-bar').exists()).toBe(false);
  });
  it('cancels multi-selection mode when cancel button is clicked', async () => {
    capture.listProjects.mockResolvedValue(projects);
    const wrapper = mount(ProjectPicker, { global: { stubs } });
    await settle();

    await wrapper.get('.select-toggle-button').trigger('click');
    await settle();
    expect(wrapper.find('.project-selection-bar').exists()).toBe(true);

    const cancelBtn = wrapper.findAll('.selection-bar-right button').find((b) => b.text().includes('Cancel'));
    await cancelBtn?.trigger('click');
    await settle();

    expect(wrapper.find('.project-selection-bar').exists()).toBe(false);
    expect(wrapper.findAll('.project-title-checkbox')).toHaveLength(0);
  });
});
