import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useVirtualList } from '@vueuse/core';
import { useScrollShadow } from '~/ui/scroll-shadow/useScrollShadow';
import { capture } from '~/api/capture';
import type { CaptureProject } from '~/api/types/capture-api';
import { useTranslate } from '~/i18n/useTranslate';
import { useProjectPreviews } from './useProjectPreviews';
import type { ProjectPickerProps, ProjectPickerEmit, ProjectPickerSearchInput } from './project-picker-types';

export function useProjectPicker(props: ProjectPickerProps, emit: ProjectPickerEmit) {
  const { t } = useTranslate('ProjectPicker');
  const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

  let cachedProjects: CaptureProject[] | null = null;

  const projects = ref<CaptureProject[]>([]);
  const selectedProjectId = ref<string | null>(null);
  const isLoading = ref(true);
  const errorMessage = ref('');

  const isSearchOpen = ref(false);
  const searchQuery = ref('');
  const searchInputRef = ref<ProjectPickerSearchInput | null>(null);

  const isSelectionMode = ref(false);
  const selectedBatchIds = ref<Set<string>>(new Set());
  const isDeletingBatch = ref(false);
  const deleteBatchError = ref('');

  const isAllSelected = computed(() => {
    const list = filteredProjects.value;
    return list.length > 0 && list.every((p) => selectedBatchIds.value.has(p.id));
  });

  const isSomeSelected = computed(() => {
    const list = filteredProjects.value;
    const count = list.filter((p) => selectedBatchIds.value.has(p.id)).length;
    return count > 0 && count < list.length;
  });

  const toggleSelectionMode = () => {
    if (isSearchOpen.value) {
      isSearchOpen.value = false;
      searchQuery.value = '';
    }
    isSelectionMode.value = !isSelectionMode.value;
    if (!isSelectionMode.value) {
      selectedBatchIds.value = new Set();
    }
  };

  const cancelSelectionMode = () => {
    isSelectionMode.value = false;
    selectedBatchIds.value = new Set();
  };

  const toggleBatchSelect = (id: string) => {
    const next = new Set(selectedBatchIds.value);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    selectedBatchIds.value = next;
  };

  const toggleSelectAll = () => {
    if (isAllSelected.value) {
      selectedBatchIds.value = new Set();
    } else {
      selectedBatchIds.value = new Set(filteredProjects.value.map((p) => p.id));
    }
  };

  const handleDeleteBatch = async () => {
    if (selectedBatchIds.value.size === 0 || isDeletingBatch.value) return;
    isDeletingBatch.value = true;
    deleteBatchError.value = '';
    try {
      const ids = Array.from(selectedBatchIds.value);
      for (const id of ids) {
        const project = projects.value.find((item) => item.id === id);
        if (project?.mode === 'screenshot') await capture.deleteProject(id, 'screenshot');
        else await capture.deleteProject(id);
        if (project) emit('delete-project', project);
      }
      const wasSelectedDeleted = selectedProjectId.value && selectedBatchIds.value.has(selectedProjectId.value);
      selectedBatchIds.value = new Set();
      isSelectionMode.value = false;
      cachedProjects = null;
      await loadProjects();

      if (wasSelectedDeleted) {
        const remaining = projects.value;
        const nextProject = remaining[0] ?? null;
        if (nextProject) {
          selectedProjectId.value = nextProject.id;
          emit('select-project', nextProject);
        } else {
          selectedProjectId.value = null;
        }
      }
    } catch (error) {
      deleteBatchError.value = error instanceof Error ? error.message : String(error);
    } finally {
      isDeletingBatch.value = false;
    }
  };

  const toggleSearch = () => {
    if (isSelectionMode.value) {
      cancelSelectionMode();
    }
    isSearchOpen.value = !isSearchOpen.value;
    if (isSearchOpen.value) {
      void nextTick(() => {
        if (isSearchOpen.value) searchInputRef.value?.inputRef?.focus({ preventScroll: true });
      });
    } else {
      searchQuery.value = '';
    }
  };

  const clearSearch = () => {
    searchQuery.value = '';
    searchInputRef.value?.inputRef?.focus({ preventScroll: true });
  };

  const handleSearchKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      if (searchQuery.value) {
        searchQuery.value = '';
      } else {
        isSearchOpen.value = false;
      }
    }
  };

  const filteredProjects = computed(() => {
    const query = searchQuery.value.trim().toLowerCase();
    if (!query) return projects.value;
    return projects.value.filter((project) => project.name.toLowerCase().includes(query));
  });

  const projectRows = computed(() => {
    const rows: CaptureProject[][] = [];
    const listToDisplay = filteredProjects.value;
    for (let index = 0; index < listToDisplay.length; index += 2) {
      rows.push(listToDisplay.slice(index, index + 2));
    }
    return rows;
  });

  const { list, containerProps, wrapperProps } = useVirtualList(projectRows, {
    itemHeight: () => (props.compact ? 128 : 144),
    overscan: 3,
  });

  const { hasTopShadow, hasBottomShadow } = useScrollShadow(containerProps.ref, {
    offset: 2,
    orientation: 'vertical',
  });

  const maskStyle = computed(() => {
    const top = hasTopShadow.value;
    const bottom = hasBottomShadow.value;
    if (top && bottom) {
      return {
        maskImage: 'linear-gradient(to bottom, transparent 0%, black 24px, black calc(100% - 24px), transparent 100%)',
        WebkitMaskImage:
          'linear-gradient(to bottom, transparent 0%, black 24px, black calc(100% - 24px), transparent 100%)',
      };
    }
    if (top) {
      return {
        maskImage: 'linear-gradient(to bottom, transparent 0%, black 24px, black 100%)',
        WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 24px, black 100%)',
      };
    }
    if (bottom) {
      return {
        maskImage: 'linear-gradient(to bottom, black 0%, black calc(100% - 24px), transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black calc(100% - 24px), transparent 100%)',
      };
    }
    return {};
  });

  const previews = useProjectPreviews(containerProps.ref);
  const { generateThumbnailsForProjects } = previews;

  const selectedProject = computed(
    () => projects.value.find((project) => project.id === selectedProjectId.value) ?? null,
  );

  const isRefreshing = ref(false);
  const isRefreshSuccess = ref(false);
  let refreshSuccessTimeout: ReturnType<typeof setTimeout> | null = null;

  const loadProjects = async () => {
    if (cachedProjects && cachedProjects.length > 0) {
      projects.value = [...cachedProjects];
      isLoading.value = false;
      void generateThumbnailsForProjects(projects.value);
    } else {
      isLoading.value = true;
    }
    errorMessage.value = '';
    try {
      const nextProjects = await capture.listProjects();
      cachedProjects = nextProjects;
      projects.value = [...nextProjects];
      selectedProjectId.value = projects.value.some((project) => project.id === props.currentProjectId)
        ? props.currentProjectId
        : (projects.value[0]?.id ?? null);
      void generateThumbnailsForProjects(projects.value);
    } catch (error) {
      if (!cachedProjects) projects.value = [];
      errorMessage.value = error instanceof Error ? error.message : String(error);
    } finally {
      isLoading.value = false;
    }
  };

  const handleRefresh = async () => {
    if (isRefreshing.value || isLoading.value) return;
    isRefreshing.value = true;
    isRefreshSuccess.value = false;
    if (refreshSuccessTimeout) clearTimeout(refreshSuccessTimeout);
    try {
      cachedProjects = null;
      const [nextProjects] = await Promise.all([
        capture.listProjects(),
        new Promise((resolve) => setTimeout(resolve, 350)),
      ]);
      cachedProjects = nextProjects;
      projects.value = [...nextProjects];
      selectedProjectId.value = projects.value.some((project) => project.id === props.currentProjectId)
        ? props.currentProjectId
        : (projects.value[0]?.id ?? null);
      void generateThumbnailsForProjects(projects.value);
      isRefreshSuccess.value = true;
      refreshSuccessTimeout = setTimeout(() => {
        isRefreshSuccess.value = false;
      }, 1600);
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error);
    } finally {
      isRefreshing.value = false;
    }
  };

  const selectProject = (project: CaptureProject) => {
    selectedProjectId.value = project.id;
    if (props.compact) emit('select-project', project);
  };

  const openSelectedProject = () => {
    if (selectedProject.value && selectedProject.value.id !== props.currentProjectId) {
      emit('open-project', selectedProject.value);
    }
  };

  const formatDate = (date: string) => {
    const parsedDate = new Date(date);
    if (Number.isNaN(parsedDate.getTime())) return t('dateUnknown');
    return dateFormatter.format(parsedDate);
  };

  const handleProjectOpen = (project: CaptureProject) => {
    selectProject(project);
    openSelectedProject();
  };

  onMounted(() => {
    void loadProjects();
  });

  onUnmounted(() => {
    if (refreshSuccessTimeout) clearTimeout(refreshSuccessTimeout);
  });

  watch(
    () => props.currentProjectId,
    (projectId) => {
      if (projectId && projects.value.some((project) => project.id === projectId)) {
        selectedProjectId.value = projectId;
      }
    },
  );

  // New project states
  const isNewProjectOpen = ref(false);
  const newProjectName = ref('');
  const newProjectError = ref('');
  const newProjectBusy = ref(false);

  // Rename project states
  const renameProjectId = ref('');
  const renameValue = ref('');
  const renameError = ref('');
  const renameBusy = ref(false);

  // Delete project states
  const deleteProjectId = ref('');
  const deleteError = ref('');
  const deleteBusy = ref(false);
  const deleteConfirmProjectId = ref<string | null>(null);

  const handleActionPopoverToggle = (isOpen: boolean) => {
    if (!isOpen) {
      deleteConfirmProjectId.value = null;
      deleteError.value = '';
    }
    emit('toggle-popover', isOpen);
  };

  const openNewProjectDialog = () => {
    newProjectName.value = '';
    newProjectError.value = '';
    isNewProjectOpen.value = true;
  };

  const handleCreateProject = async () => {
    newProjectBusy.value = true;
    newProjectError.value = '';
    try {
      const created = await capture.createProject({
        name: newProjectName.value.trim() || undefined,
      });
      cachedProjects = null;
      await loadProjects();
      isNewProjectOpen.value = false;
      emit('open-project', created);
    } catch (error) {
      newProjectError.value = error instanceof Error ? error.message : String(error);
    } finally {
      newProjectBusy.value = false;
    }
  };

  let renameOpenedAt = 0;

  const startRename = (project: CaptureProject) => {
    renameOpenedAt = Date.now();
    renameProjectId.value = project.id;
    renameValue.value = project.name;
    renameError.value = '';
    void nextTick(() => {
      const cardEl = document.querySelector<HTMLElement>(`.project-card-container[data-project-id="${project.id}"]`);
      const inputEl = cardEl?.querySelector<HTMLInputElement>('input');
      if (inputEl) {
        inputEl.focus();
        inputEl.select();
      }
    });
  };

  const cancelRename = () => {
    renameProjectId.value = '';
    renameValue.value = '';
  };

  const handleRenameProject = async () => {
    if (Date.now() - renameOpenedAt < 250) {
      return;
    }
    const trimmed = renameValue.value.trim();
    const originalProject = projects.value.find((p) => p.id === renameProjectId.value);
    if (!trimmed || (originalProject && originalProject.name === trimmed)) {
      cancelRename();
      return;
    }
    renameBusy.value = true;
    renameError.value = '';
    try {
      const renamed =
        originalProject?.mode === 'screenshot'
          ? await capture.renameProject(renameProjectId.value, trimmed, 'screenshot')
          : await capture.renameProject(renameProjectId.value, trimmed);
      emit('rename-project', renamed);
      cachedProjects = null;
      await loadProjects();
      cancelRename();
    } catch (error) {
      renameError.value = error instanceof Error ? error.message : String(error);
      console.error('Rename failed:', renameError.value);
      cancelRename();
    } finally {
      renameBusy.value = false;
    }
  };

  const confirmDeleteProject = (project: CaptureProject) => {
    deleteProjectId.value = project.id;
    deleteError.value = '';
    deleteConfirmProjectId.value = project.id;
  };

  const handleDeleteProject = async () => {
    deleteBusy.value = true;
    deleteError.value = '';
    try {
      const project = projects.value.find((item) => item.id === deleteProjectId.value);
      const wasSelectedDeleted = selectedProjectId.value === deleteProjectId.value;
      if (project?.mode === 'screenshot') await capture.deleteProject(deleteProjectId.value, 'screenshot');
      else await capture.deleteProject(deleteProjectId.value);
      if (project) emit('delete-project', project);
      cachedProjects = null;
      await loadProjects();
      deleteConfirmProjectId.value = null;

      // If the currently selected project was deleted, pick the first remaining one
      if (wasSelectedDeleted) {
        const remaining = projects.value;
        const nextProject = remaining[0] ?? null;
        if (nextProject) {
          selectedProjectId.value = nextProject.id;
          emit('select-project', nextProject);
        } else {
          selectedProjectId.value = null;
        }
      }
    } catch (error) {
      deleteError.value = error instanceof Error ? error.message : String(error);
    } finally {
      deleteBusy.value = false;
    }
  };

  const revealProjectFolder = (project: CaptureProject) => {
    void (project.mode === 'screenshot'
      ? capture.revealProject(project.id, 'screenshot')
      : capture.revealProject(project.id));
  };

  return {
    t,
    projects,
    selectedProjectId,
    isLoading,
    errorMessage,
    isSearchOpen,
    searchQuery,
    searchInputRef,
    isSelectionMode,
    selectedBatchIds,
    isDeletingBatch,
    isAllSelected,
    isSomeSelected,
    toggleSelectionMode,
    cancelSelectionMode,
    toggleBatchSelect,
    toggleSelectAll,
    handleDeleteBatch,
    toggleSearch,
    clearSearch,
    handleSearchKeydown,
    filteredProjects,
    maskStyle,
    selectedProject,
    isRefreshing,
    isRefreshSuccess,
    loadProjects,
    handleRefresh,
    selectProject,
    openSelectedProject,
    formatDate,
    handleProjectOpen,
    isNewProjectOpen,
    newProjectName,
    newProjectError,
    newProjectBusy,
    renameProjectId,
    renameValue,
    renameBusy,
    deleteError,
    deleteBusy,
    deleteConfirmProjectId,
    handleActionPopoverToggle,
    openNewProjectDialog,
    handleCreateProject,
    startRename,
    cancelRename,
    handleRenameProject,
    confirmDeleteProject,
    handleDeleteProject,
    revealProjectFolder,
    list,
    containerProps,
    wrapperProps,
    ...previews,
    invalidate: () => {
      cachedProjects = null;
    },
  };
}
