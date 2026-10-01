import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { defineComponent, reactive, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptureProject } from '~/api/types/capture-api';
import type { ProjectPickerProps } from './project-picker-types';
import { captureMock as capture } from '../hud/tests/capture.mock';
vi.mock('~/api/capture', () => ({ capture }));
const shadows = vi.hoisted(() => ({ top: false, bottom: false }));
vi.mock('~/ui/scroll-shadow/useScrollShadow', () => ({
  useScrollShadow: () => ({ hasTopShadow: ref(shadows.top), hasBottomShadow: ref(shadows.bottom) }),
}));
import { useProjectPicker } from './useProjectPicker';
enableAutoUnmount(afterEach);
const first = { id: 'one', name: 'First', previewSrc: null, mode: 'studio' } as CaptureProject;
const image = { id: 'image', name: 'Screenshot', previewSrc: null, mode: 'screenshot' } as CaptureProject;
const create = async (patch: Partial<ProjectPickerProps> = {}) => {
  const props = reactive({ compact: false, currentProjectId: null, ...patch });
  const emit = vi.fn();
  let picker!: ReturnType<typeof useProjectPicker>;
  const wrapper = mount(
    defineComponent({
      setup() {
        picker = useProjectPicker(props, emit);
        return () => null;
      },
    }),
  );
  await flushPromises();
  return { picker, props, emit, wrapper };
};
beforeEach(() => {
  vi.useFakeTimers();
  capture.listProjects.mockReset().mockResolvedValue([first, image]);
  capture.createProject.mockReset().mockResolvedValue(first);
  capture.renameProject.mockReset().mockResolvedValue(image);
  capture.deleteProject.mockReset().mockResolvedValue(undefined);
  capture.revealProject.mockClear();
  shadows.top = false;
  shadows.bottom = false;
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('project picker loading and selection', () => {
  it('lets cached cards present before requesting background revalidation', async () => {
    const { picker, props } = await create({ compact: true, active: true });
    props.active = false;
    await flushPromises();
    props.active = true;
    await flushPromises();
    expect(picker.projects.value).toEqual([first, image]);
    expect(capture.listProjects).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(16);
    expect(capture.listProjects).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(16);
    expect(capture.listProjects).toHaveBeenCalledTimes(2);
  });
  it.each(['close', 'unmount'])('cancels a queued revalidation on %s', async (action) => {
    const { props, wrapper } = await create({ compact: true, active: true });
    props.active = false;
    await flushPromises();
    props.active = true;
    await flushPromises();
    if (action === 'close') props.active = false;
    else wrapper.unmount();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(100);
    expect(capture.listProjects).toHaveBeenCalledOnce();
  });
  it('defers hidden loading and keeps cached cards visible while revalidating on reopen', async () => {
    const { picker, props } = await create({ compact: true, active: false });
    expect(capture.listProjects).not.toHaveBeenCalled();
    props.active = true;
    await flushPromises();
    expect(picker.projects.value).toEqual([first, image]);
    props.active = false;
    await flushPromises();
    let complete!: (projects: CaptureProject[]) => void;
    capture.listProjects.mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    props.active = true;
    await flushPromises();
    expect(picker.isLoading.value).toBe(false);
    expect(picker.projects.value).toEqual([first, image]);
    void picker.loadProjects();
    expect(capture.listProjects).toHaveBeenCalledTimes(2);
    complete([image]);
    await flushPromises();
    expect(picker.projects.value).toEqual([image]);
  });

  it('keeps an already loaded empty catalogue stable on reopen', async () => {
    capture.listProjects.mockResolvedValue([]);
    const { picker, props } = await create({ active: true });
    props.active = false;
    await flushPromises();
    capture.listProjects.mockReturnValueOnce(new Promise(() => undefined));
    props.active = true;
    await flushPromises();
    expect(picker.isLoading.value).toBe(false);
    expect(picker.projects.value).toEqual([]);
  });

  it('completes explicit refresh without an artificial minimum delay', async () => {
    const { picker } = await create();
    await picker.handleRefresh();
    expect(picker.isRefreshing.value).toBe(false);
    expect(picker.isRefreshSuccess.value).toBe(true);
  });
  it('retains cached projects during reload and failed refresh, and invalidates explicitly', async () => {
    const { picker } = await create({ currentProjectId: 'image', compact: true });
    expect(picker.selectedProject.value).toEqual(image);
    capture.listProjects.mockRejectedValueOnce('offline');
    const reloading = picker.loadProjects();
    expect(picker.isLoading.value).toBe(false);
    await reloading;
    expect(picker.projects.value).toEqual([first, image]);
    expect(picker.errorMessage.value).toBe('offline');
    picker.invalidate();
    capture.listProjects.mockRejectedValueOnce(new Error('unavailable'));
    await picker.loadProjects();
    expect(picker.projects.value).toEqual([]);
    expect(picker.errorMessage.value).toBe('unavailable');
  });
  it('tracks valid current project changes and ignores absent or unknown ids', async () => {
    const { picker, props, emit } = await create();
    picker.openSelectedProject();
    expect(emit).toHaveBeenCalledWith('open-project', first);
    props.currentProjectId = 'image';
    await flushPromises();
    expect(picker.selectedProjectId.value).toBe('image');
    emit.mockClear();
    picker.openSelectedProject();
    expect(emit).not.toHaveBeenCalled();
    props.currentProjectId = 'unknown';
    await flushPromises();
    props.currentProjectId = null;
    await flushPromises();
    expect(picker.selectedProjectId.value).toBe('image');
    picker.selectedProjectId.value = null;
    picker.openSelectedProject();
    expect(emit).not.toHaveBeenCalled();
    picker.handleProjectOpen(first);
    expect(emit).toHaveBeenCalledWith('open-project', first);
  });
  it('does not refresh while loading or already refreshing, then reports success briefly', async () => {
    const { picker, wrapper } = await create();
    picker.isLoading.value = true;
    await picker.handleRefresh();
    expect(capture.listProjects).toHaveBeenCalledTimes(1);
    picker.isLoading.value = false;
    const refreshing = picker.handleRefresh();
    await picker.handleRefresh();
    await vi.advanceTimersByTimeAsync(350);
    await refreshing;
    expect(picker.isRefreshSuccess.value).toBe(true);
    const again = picker.handleRefresh();
    await vi.advanceTimersByTimeAsync(350);
    await again;
    await vi.advanceTimersByTimeAsync(1600);
    expect(picker.isRefreshSuccess.value).toBe(false);
    const pending = picker.handleRefresh();
    await vi.advanceTimersByTimeAsync(350);
    await pending;
    wrapper.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([new Error('failed'), 'denied'])(
    'surfaces refresh failures without replacing the visible projects: %s',
    async (reason) => {
      const { picker } = await create();
      capture.listProjects.mockRejectedValueOnce(reason);
      const refreshing = picker.handleRefresh();
      await vi.advanceTimersByTimeAsync(350);
      await refreshing;
      expect(picker.errorMessage.value).toBe(reason instanceof Error ? reason.message : reason);
      expect(picker.projects.value).toHaveLength(2);
      expect(picker.isRefreshing.value).toBe(false);
    },
  );
  it('selects no project in an empty library or after refresh empties it', async () => {
    capture.listProjects.mockResolvedValue([]);
    const { picker } = await create();
    expect(picker.selectedProjectId.value).toBeNull();
    const refreshing = picker.handleRefresh();
    await vi.advanceTimersByTimeAsync(350);
    await refreshing;
    expect(picker.selectedProject.value).toBeNull();
  });
  it.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ])('builds the scroll mask for top=%s bottom=%s', async (top, bottom) => {
    shadows.top = top;
    shadows.bottom = bottom;
    const { picker } = await create();
    expect(Boolean(picker.maskStyle.value.maskImage)).toBe(top || bottom);
    expect(picker.maskStyle.value.maskImage).toBe(picker.maskStyle.value.WebkitMaskImage);
  });
});

describe('project picker search and batch actions', () => {
  it('focuses search without scrolling, clears queries, and handles Escape in two steps', async () => {
    const { picker } = await create();
    const focus = vi.fn();
    picker.searchInputRef.value = { inputRef: { focus } as unknown as HTMLInputElement };
    picker.toggleSearch();
    await flushPromises();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    picker.searchQuery.value = '  FIRST  ';
    expect(picker.filteredProjects.value).toEqual([first]);
    picker.handleSearchKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(picker.searchQuery.value).toBe('  FIRST  ');
    picker.handleSearchKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(picker.searchQuery.value).toBe('');
    expect(picker.isSearchOpen.value).toBe(true);
    picker.handleSearchKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(picker.isSearchOpen.value).toBe(false);
    picker.toggleSearch();
    picker.toggleSearch();
    await flushPromises();
    picker.clearSearch();
    expect(picker.searchQuery.value).toBe('');
    picker.toggleSelectionMode();
    picker.toggleBatchSelect('one');
    picker.toggleSearch();
    expect(picker.isSelectionMode.value).toBe(false);
    expect(picker.selectedBatchIds.value.size).toBe(0);
    picker.toggleSelectionMode();
    expect(picker.isSearchOpen.value).toBe(false);
    picker.toggleSelectionMode();
    expect(picker.selectedBatchIds.value.size).toBe(0);
  });
  it('toggles individual and all filtered selections', async () => {
    const { picker } = await create();
    expect(picker.isAllSelected.value).toBe(false);
    expect(picker.isSomeSelected.value).toBe(false);
    picker.toggleBatchSelect('one');
    expect(picker.isSomeSelected.value).toBe(true);
    picker.toggleBatchSelect('one');
    expect(picker.selectedBatchIds.value.size).toBe(0);
    picker.toggleSelectAll();
    expect(picker.isAllSelected.value).toBe(true);
    picker.toggleSelectAll();
    expect(picker.selectedBatchIds.value.size).toBe(0);
    picker.searchQuery.value = 'screenshot';
    picker.toggleSelectAll();
    expect([...picker.selectedBatchIds.value]).toEqual(['image']);
    picker.searchQuery.value = 'absent';
    expect(picker.isAllSelected.value).toBe(false);
  });
  it('deletes mixed project modes serially and selects the remaining project', async () => {
    const { picker, emit } = await create({ currentProjectId: 'one' });
    await picker.handleDeleteBatch();
    expect(capture.deleteProject).not.toHaveBeenCalled();
    picker.toggleSelectAll();
    capture.listProjects.mockResolvedValue([image]);
    const deleting = picker.handleDeleteBatch();
    await picker.handleDeleteBatch();
    await deleting;
    expect(capture.deleteProject.mock.calls).toEqual([['one'], ['image', 'screenshot']]);
    expect(emit).toHaveBeenCalledWith('select-project', image);
    expect(picker.selectedBatchIds.value.size).toBe(0);
  });
  it('handles deleted stale ids and an empty library after batch deletion', async () => {
    const { picker, emit } = await create({ currentProjectId: 'one' });
    picker.toggleBatchSelect('one');
    picker.toggleBatchSelect('missing');
    capture.listProjects.mockResolvedValue([]);
    await picker.handleDeleteBatch();
    expect(picker.selectedProjectId.value).toBeNull();
    expect(emit.mock.calls.filter(([event]) => event === 'delete-project')).toHaveLength(1);
  });
  it.each([new Error('locked'), 'locked'])('retains selection when batch deletion fails: %s', async (reason) => {
    const { picker } = await create();
    picker.toggleBatchSelect('image');
    capture.deleteProject.mockRejectedValueOnce(reason);
    await picker.handleDeleteBatch();
    expect(picker.selectedBatchIds.value.has('image')).toBe(true);
    expect(picker.isDeletingBatch.value).toBe(false);
  });
});

describe('project picker individual mutations', () => {
  it('creates a default named project and reports creation failures', async () => {
    const { picker, emit } = await create();
    picker.openNewProjectDialog();
    await picker.handleCreateProject();
    expect(capture.createProject).toHaveBeenCalledWith({ name: undefined });
    expect(emit).toHaveBeenCalledWith('open-project', first);
    for (const reason of [new Error('no space'), 'blocked']) {
      picker.openNewProjectDialog();
      capture.createProject.mockRejectedValueOnce(reason);
      await picker.handleCreateProject();
      expect(picker.newProjectError.value).toBe(reason instanceof Error ? reason.message : reason);
      expect(picker.isNewProjectOpen.value).toBe(true);
      expect(picker.newProjectBusy.value).toBe(false);
    }
  });
  it('focuses rename and immediately saves screenshots through their own route', async () => {
    const { picker, emit } = await create();
    const card = document.createElement('div');
    card.className = 'project-card-container';
    card.dataset.projectId = 'image';
    const input = document.createElement('input');
    card.append(input);
    document.body.append(card);
    const focus = vi.spyOn(input, 'focus');
    const select = vi.spyOn(input, 'select');
    picker.startRename(image);
    picker.renameValue.value = ' Renamed ';
    await flushPromises();
    expect(focus).toHaveBeenCalled();
    expect(select).toHaveBeenCalled();
    await picker.handleRenameProject();
    expect(capture.renameProject).toHaveBeenCalledWith('image', 'Renamed', 'screenshot');
    expect(emit).toHaveBeenCalledWith('rename-project', image);
    card.remove();
    picker.startRename(first);
    picker.renameValue.value = '   ';
    await vi.advanceTimersByTimeAsync(250);
    await picker.handleRenameProject();
    expect(picker.renameProjectId.value).toBe('');
  });
  it('ignores duplicate rename submissions and canceled edits', async () => {
    const { picker } = await create();
    let finish!: (project: CaptureProject) => void;
    capture.renameProject.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    picker.startRename(first);
    picker.renameValue.value = 'Changed';
    const saving = picker.handleRenameProject();
    await picker.handleRenameProject();
    expect(capture.renameProject).toHaveBeenCalledOnce();
    finish({ ...first, name: 'Changed' });
    await saving;
    await picker.handleRenameProject();
    picker.startRename(first);
    picker.cancelRename();
    await picker.handleRenameProject();
    expect(capture.renameProject).toHaveBeenCalledOnce();
  });
  it('handles a removed project while rename is pending and non-Error failures', async () => {
    const { picker } = await create();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    picker.startRename(first);
    picker.projects.value = [];
    picker.renameValue.value = 'Changed';
    capture.renameProject.mockRejectedValueOnce('locked');
    await vi.advanceTimersByTimeAsync(250);
    await picker.handleRenameProject();
    expect(error).toHaveBeenCalledWith('Rename failed:', 'locked');
    expect(picker.renameBusy.value).toBe(false);
  });
  it('deletes the selected screenshot and closes the confirmation, including the last project', async () => {
    const { picker, emit } = await create({ currentProjectId: 'image' });
    picker.confirmDeleteProject(image);
    capture.listProjects.mockResolvedValue([first]);
    await picker.handleDeleteProject();
    expect(capture.deleteProject).toHaveBeenCalledWith('image', 'screenshot');
    expect(emit).toHaveBeenCalledWith('select-project', first);
    picker.confirmDeleteProject(first);
    capture.listProjects.mockResolvedValue([]);
    await picker.handleDeleteProject();
    expect(picker.selectedProjectId.value).toBeNull();
    expect(picker.deleteConfirmProjectId.value).toBeNull();
  });
  it('keeps a failed delete recoverable and clears it only when its popover closes', async () => {
    const { picker, emit } = await create();
    picker.confirmDeleteProject(image);
    for (const reason of [new Error('locked'), 'denied']) {
      capture.deleteProject.mockRejectedValueOnce(reason);
      await picker.handleDeleteProject();
      expect(picker.deleteError.value).toBe(reason instanceof Error ? reason.message : reason);
    }
    picker.handleActionPopoverToggle(true);
    expect(picker.deleteConfirmProjectId.value).toBe('image');
    picker.handleActionPopoverToggle(false);
    expect(picker.deleteConfirmProjectId.value).toBeNull();
    expect(picker.deleteError.value).toBe('');
    expect(emit).toHaveBeenCalledWith('toggle-popover', false);
    picker.confirmDeleteProject({ ...first, id: 'removed' });
    await picker.handleDeleteProject();
    expect(capture.deleteProject).toHaveBeenCalledWith('removed');
  });
  it('reveals both project categories and translates invalid dates', async () => {
    const { picker } = await create();
    picker.revealProjectFolder(first);
    picker.revealProjectFolder(image);
    expect(capture.revealProject.mock.calls).toEqual([['one'], ['image', 'screenshot']]);
    expect(picker.formatDate('invalid')).toBe('Unknown date');
    expect(picker.formatDate('2026-09-30')).not.toBe('Unknown date');
  });
});
