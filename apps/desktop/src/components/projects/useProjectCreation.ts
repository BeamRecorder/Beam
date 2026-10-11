import { onUnmounted, ref } from 'vue';
import { capture } from '~/api/capture';
import type { NewProjectMode, ProjectCreationOptions } from './project-creation-types';

export function useProjectCreation(options: ProjectCreationOptions) {
  const isNewProjectOpen = ref(false);
  const newProjectName = ref('');
  const newProjectMode = ref<NewProjectMode>('studio');
  const newProjectError = ref('');
  const newProjectBusy = ref(false);
  let generation = 0;
  let disposed = false;
  onUnmounted(() => {
    disposed = true;
    generation++;
  });
  const reportError = (error: unknown) => {
    newProjectError.value = error instanceof Error ? error.message : String(error);
  };
  const openNewProjectDialog = async () => {
    if (newProjectBusy.value || disposed) return;
    const current = ++generation;
    newProjectName.value = '';
    newProjectError.value = '';
    isNewProjectOpen.value = true;
    newProjectBusy.value = true;
    try {
      const preferences = await capture.getPreferences();
      if (current !== generation || !isNewProjectOpen.value) return;
      newProjectMode.value = preferences.extras.newProjectMode === 'screenshot' ? 'screenshot' : 'studio';
    } catch (error) {
      if (current === generation) reportError(error);
    } finally {
      if (current === generation) newProjectBusy.value = false;
    }
  };
  const selectNewProjectMode = async (mode: NewProjectMode) => {
    if (newProjectBusy.value || disposed || mode === newProjectMode.value) return;
    const previous = newProjectMode.value;
    newProjectMode.value = mode;
    newProjectBusy.value = true;
    newProjectError.value = '';
    try {
      await capture.updatePreferences({ extras: { newProjectMode: mode } });
    } catch (error) {
      if (!disposed) {
        newProjectMode.value = previous;
        reportError(error);
      }
    } finally {
      if (!disposed) newProjectBusy.value = false;
    }
  };
  const handleCreateProject = async () => {
    if (newProjectBusy.value || disposed) return;
    newProjectBusy.value = true;
    newProjectError.value = '';
    try {
      const created = await capture.createProject({
        name: newProjectName.value.trim() || undefined,
        mode: newProjectMode.value,
      });
      if (disposed) return;
      await options.refresh();
      if (disposed) return;
      isNewProjectOpen.value = false;
      options.open(created);
    } catch (error) {
      if (!disposed) reportError(error);
    } finally {
      if (!disposed) newProjectBusy.value = false;
    }
  };
  return {
    isNewProjectOpen,
    newProjectName,
    newProjectMode,
    newProjectError,
    newProjectBusy,
    openNewProjectDialog,
    selectNewProjectMode,
    handleCreateProject,
  };
}
