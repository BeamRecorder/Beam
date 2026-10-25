import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptureProject } from '~/api/types/capture-api';
import { captureMock as capture } from '../hud/tests/capture.mock';
import { useProjectCreation } from './useProjectCreation';
vi.mock('~/api/capture', () => ({ capture }));

enableAutoUnmount(afterEach);
const project = { id: 'new', name: 'New', mode: 'screenshot' } as CaptureProject;
const preferences = { extras: {} };
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};
const setup = () => {
  const refresh = vi.fn().mockResolvedValue(undefined);
  const open = vi.fn();
  let creation!: ReturnType<typeof useProjectCreation>;
  const wrapper = mount(
    defineComponent({
      setup() {
        creation = useProjectCreation({ refresh, open });
        return () => null;
      },
    }),
  );
  return { creation, refresh, open, wrapper };
};
beforeEach(() => {
  capture.getPreferences.mockReset().mockResolvedValue(preferences);
  capture.updatePreferences.mockReset().mockResolvedValue(preferences);
  capture.createProject.mockReset().mockResolvedValue(project);
});

describe('New project choice', () => {
  it.each([undefined, 'instant', null, 42, 'studio', 'screenshot'])(
    'restores the saved supported choice (%s) without rewriting preferences',
    async (mode) => {
      capture.getPreferences.mockResolvedValue({ extras: { newProjectMode: mode } });
      const { creation } = setup();
      creation.newProjectName.value = 'Old draft';
      creation.newProjectError.value = 'Old error';
      await creation.openNewProjectDialog();
      expect(creation.newProjectMode.value).toBe(mode === 'screenshot' ? 'screenshot' : 'studio');
      expect(creation.newProjectName.value).toBe('');
      expect(creation.newProjectError.value).toBe('');
      expect(capture.updatePreferences).not.toHaveBeenCalled();
    },
  );
  it('persists choices even when canceled, independently of recorder preferences and picker lifetime', async () => {
    capture.updatePreferences.mockImplementation(async (patch) => {
      const next = { extras: { captureMode: 'instant', ...patch.extras } };
      capture.getPreferences.mockResolvedValue(next);
      return next;
    });
    const first = setup();
    await first.creation.openNewProjectDialog();
    await first.creation.selectNewProjectMode('screenshot');
    expect(capture.updatePreferences).toHaveBeenLastCalledWith({ extras: { newProjectMode: 'screenshot' } });
    first.creation.isNewProjectOpen.value = false;
    first.wrapper.unmount();
    const second = setup();
    await second.creation.openNewProjectDialog();
    expect(second.creation.newProjectMode.value).toBe('screenshot');
    await second.creation.selectNewProjectMode('studio');
    expect(capture.updatePreferences).toHaveBeenLastCalledWith({ extras: { newProjectMode: 'studio' } });
    expect(capture.createProject).not.toHaveBeenCalled();
  });
  it('blocks interaction while loading, saving or creating and ignores the already selected choice', async () => {
    const load = deferred<typeof preferences>();
    capture.getPreferences.mockReturnValueOnce(load.promise);
    const { creation } = setup();
    const opening = creation.openNewProjectDialog();
    await creation.openNewProjectDialog();
    await creation.selectNewProjectMode('screenshot');
    await creation.handleCreateProject();
    expect(capture.getPreferences).toHaveBeenCalledOnce();
    expect(capture.updatePreferences).not.toHaveBeenCalled();
    expect(capture.createProject).not.toHaveBeenCalled();
    load.resolve(preferences);
    await opening;
    await creation.selectNewProjectMode('studio');
    expect(capture.updatePreferences).not.toHaveBeenCalled();
    const save = deferred<typeof preferences>();
    capture.updatePreferences.mockReturnValueOnce(save.promise);
    const saving = creation.selectNewProjectMode('screenshot');
    await creation.selectNewProjectMode('studio');
    await creation.handleCreateProject();
    expect(creation.newProjectMode.value).toBe('screenshot');
    expect(capture.createProject).not.toHaveBeenCalled();
    save.resolve(preferences);
    await saving;
    const create = deferred<CaptureProject>();
    capture.createProject.mockReturnValueOnce(create.promise);
    const creating = creation.handleCreateProject();
    await creation.handleCreateProject();
    await creation.openNewProjectDialog();
    expect(capture.createProject).toHaveBeenCalledOnce();
    create.resolve(project);
    await creating;
    expect(creation.newProjectBusy.value).toBe(false);
  });
  it.each([new Error('Disk full'), 'Permission denied'])(
    'shows failed preference writes and allows retry (%s)',
    async (reason) => {
      const { creation } = setup();
      capture.updatePreferences.mockRejectedValueOnce(reason);
      await creation.selectNewProjectMode('screenshot');
      expect(creation.newProjectMode.value).toBe('studio');
      expect(creation.newProjectError.value).toBe(String(reason instanceof Error ? reason.message : reason));
      expect(creation.newProjectBusy.value).toBe(false);
      await creation.selectNewProjectMode('screenshot');
      expect(creation.newProjectError.value).toBe('');
      expect(creation.newProjectMode.value).toBe('screenshot');
    },
  );
  it('reports failed preference reads and can reopen successfully', async () => {
    capture.getPreferences.mockRejectedValueOnce(new Error('Cannot read preferences'));
    const { creation } = setup();
    await creation.openNewProjectDialog();
    expect(creation.newProjectError.value).toBe('Cannot read preferences');
    expect(creation.newProjectBusy.value).toBe(false);
    await creation.openNewProjectDialog();
    expect(creation.newProjectError.value).toBe('');
  });
  it('ignores a preference response after closing the dialog', async () => {
    const load = deferred<{ extras: { newProjectMode: string } }>();
    capture.getPreferences.mockReturnValueOnce(load.promise);
    const { creation } = setup();
    const opening = creation.openNewProjectDialog();
    creation.isNewProjectOpen.value = false;
    load.resolve({ extras: { newProjectMode: 'screenshot' } });
    await opening;
    expect(creation.newProjectMode.value).toBe('studio');
    expect(creation.newProjectBusy.value).toBe(false);
  });
});

describe('New project creation', () => {
  it.each(['studio', 'screenshot'] as const)('creates and opens the selected %s project', async (mode) => {
    capture.getPreferences.mockResolvedValue({ extras: { newProjectMode: mode } });
    const { creation, refresh, open } = setup();
    await creation.openNewProjectDialog();
    creation.newProjectName.value = '  My project  ';
    await creation.handleCreateProject();
    expect(capture.createProject).toHaveBeenCalledWith({ name: 'My project', mode });
    expect(refresh).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledWith(project);
    expect(creation.isNewProjectOpen.value).toBe(false);
  });
  it('lets storage generate a name for an empty draft', async () => {
    const { creation } = setup();
    creation.newProjectName.value = '   ';
    await creation.handleCreateProject();
    expect(capture.createProject).toHaveBeenCalledWith({ name: undefined, mode: 'studio' });
  });
  it.each([new Error('Cannot create'), 'Cannot create'])(
    'keeps the dialog and selected mode on creation failure (%s)',
    async (reason) => {
      const { creation, open } = setup();
      await creation.openNewProjectDialog();
      await creation.selectNewProjectMode('screenshot');
      capture.createProject.mockRejectedValueOnce(reason);
      await creation.handleCreateProject();
      expect(creation.newProjectError.value).toBe('Cannot create');
      expect(creation.isNewProjectOpen.value).toBe(true);
      expect(creation.newProjectMode.value).toBe('screenshot');
      expect(creation.newProjectBusy.value).toBe(false);
      expect(open).not.toHaveBeenCalled();
    },
  );
  it('reports refresh failure before opening an editor', async () => {
    const { creation, refresh, open } = setup();
    await creation.openNewProjectDialog();
    refresh.mockRejectedValueOnce(new Error('Refresh failed'));
    await creation.handleCreateProject();
    expect(creation.newProjectError.value).toBe('Refresh failed');
    expect(open).not.toHaveBeenCalled();
  });
  it.each(['load', 'save', 'create', 'refresh'] as const)('ignores a late %s response after unmount', async (step) => {
    const pending = deferred<never>();
    const { creation, refresh, open, wrapper } = setup();
    if (step === 'load') capture.getPreferences.mockReturnValueOnce(pending.promise);
    if (step === 'save') capture.updatePreferences.mockReturnValueOnce(pending.promise);
    if (step === 'create') capture.createProject.mockReturnValueOnce(pending.promise);
    if (step === 'refresh') refresh.mockReturnValueOnce(pending.promise);
    const action =
      step === 'load'
        ? creation.openNewProjectDialog()
        : step === 'save'
          ? creation.selectNewProjectMode('screenshot')
          : creation.handleCreateProject();
    await flushPromises();
    wrapper.unmount();
    pending.resolve(project as never);
    await action;
    await creation.openNewProjectDialog();
    await creation.selectNewProjectMode('studio');
    await creation.handleCreateProject();
    expect(open).not.toHaveBeenCalled();
    expect(creation.newProjectError.value).toBe('');
  });
  it.each(['load', 'save', 'create'] as const)('ignores a late %s rejection after unmount', async (step) => {
    const pending = deferred<never>();
    const { creation, wrapper } = setup();
    if (step === 'load') capture.getPreferences.mockReturnValueOnce(pending.promise);
    if (step === 'save') capture.updatePreferences.mockReturnValueOnce(pending.promise);
    if (step === 'create') capture.createProject.mockReturnValueOnce(pending.promise);
    const action =
      step === 'load'
        ? creation.openNewProjectDialog()
        : step === 'save'
          ? creation.selectNewProjectMode('screenshot')
          : creation.handleCreateProject();
    wrapper.unmount();
    pending.reject(new Error('Late failure'));
    await action;
    expect(creation.newProjectError.value).toBe('');
  });
});
