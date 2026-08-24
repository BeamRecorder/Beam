<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useVirtualList } from '@vueuse/core';
import {
  ArrowLeft,
  Check,
  CheckSquare,
  Film,
  FolderOpen,
  RefreshCw,
  MoreVertical,
  Plus,
  Pencil,
  Search,
  ExternalLink,
  Trash2,
  X,
} from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import Checkbox from '~/ui/checkbox/Checkbox.vue';
import Divider from '~/ui/divider/Divider.vue';
import Dialog from '~/ui/dialog/Dialog.vue';
import Popover from '~/ui/popover/Popover.vue';
import Input from '~/ui/input/Input.vue';
import Skeleton from '~/ui/skeleton/Skeleton.vue';
import ProgressBar from '../ui/progressbar/ProgressBar.vue';
import BlurRevealTransition from '~/ui/transitions/BlurRevealTransition.vue';
import { useScrollShadow } from '../ui/scroll-shadow/useScrollShadow';
import { capture } from '../../api/capture';
import type { CaptureProject } from '../../api/types/capture-api';
import { useTranslate } from '~/i18n/useTranslate';
import ProjectFeatureBadges from '../projects/ProjectFeatureBadges.vue';

const { t } = useTranslate('ProjectPicker');

let cachedProjects: CaptureProject[] | null = null;

const emit = defineEmits<{
  (event: 'back'): void;
  (event: 'open-project', project: CaptureProject): void;
  (event: 'select-project', project: CaptureProject): void;
  (event: 'toggle-popover', isOpen: boolean): void;
}>();

const props = withDefaults(
  defineProps<{
    compact?: boolean;
    currentProjectId?: string | null;
  }>(),
  {
    compact: false,
    currentProjectId: null,
  },
);

const projects = ref<CaptureProject[]>([]);
const selectedProjectId = ref<string | null>(null);
const isLoading = ref(true);
const errorMessage = ref('');

const isSearchOpen = ref(false);
const searchQuery = ref('');
const searchInputRef = ref<InstanceType<typeof Input> | null>(null);

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
      await capture.deleteProject(id);
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
      searchInputRef.value?.focus();
    });
  } else {
    searchQuery.value = '';
  }
};

const clearSearch = () => {
  searchQuery.value = '';
  searchInputRef.value?.focus();
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

const selectedProject = computed(
  () => projects.value.find((project) => project.id === selectedProjectId.value) ?? null,
);

import { useProjectThumbnailGenerator } from './useProjectThumbnailGenerator';

const hoveredProjectId = ref<string | null>(null);
const { thumbnailCache, generateThumbnail } = useProjectThumbnailGenerator();

const generateThumbnailsForProjects = async (projectList: CaptureProject[]) => {
  for (const project of projectList) {
    if (project.previewSrc && !project.thumbnailSrc && !thumbnailCache[project.id]) {
      void generateThumbnail(project.id, project.previewSrc);
    }
  }
};

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
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(parsedDate);
};

const videoProgress = ref<Record<string, { current: number; total: number }>>({});
const isVideoLoaded = ref<Record<string, boolean>>({});

const handleVideoTimeUpdate = (projectId: string, event: Event) => {
  const video = event.currentTarget as HTMLVideoElement | null;
  if (video) {
    videoProgress.value[projectId] = {
      current: video.currentTime,
      total: video.duration || 1,
    };
  }
};

const handleMouseEnterVideo = (_projectId: string, event: MouseEvent) => {
  const target = event.currentTarget as HTMLElement | null;
  void nextTick(() => {
    const video = (target?.tagName === 'VIDEO' ? target : target?.querySelector('video')) as HTMLVideoElement | null;
    if (video && typeof video.play === 'function') {
      if (video.readyState === 0) {
        video.load();
      }
      video.play().catch((err) => console.debug('Play interrupted:', err));
    }
  });
};

const handleMouseLeaveVideo = (projectId: string, event: MouseEvent) => {
  isVideoLoaded.value[projectId] = false;
  const target = event.currentTarget as HTMLElement | null;
  const video = (target?.tagName === 'VIDEO' ? target : target?.querySelector('video')) as HTMLVideoElement | null;
  if (video && typeof video.pause === 'function') {
    video.pause();
    video.currentTime = Math.min(0.1, video.duration || 0);
    videoProgress.value[projectId] = { current: 0, total: 1 };
  }
};

const isScrolling = ref(false);
let scrollTimeout: ReturnType<typeof setTimeout> | null = null;

const handleScroll = () => {
  if (hoveredProjectId.value) {
    hoveredProjectId.value = null;
  }
  isScrolling.value = true;
  if (scrollTimeout) clearTimeout(scrollTimeout);
  scrollTimeout = setTimeout(() => {
    isScrolling.value = false;
  }, 150);
};

const handleProjectMouseEnter = (project: CaptureProject, event: MouseEvent) => {
  if (isScrolling.value) return;
  hoveredProjectId.value = project.id;
  if (project.previewSrc) {
    videoProgress.value[project.id] = { current: 0, total: 1 };
  }
  handleMouseEnterVideo(project.id, event);
};

const handleProjectMouseLeave = (project: CaptureProject, event: MouseEvent) => {
  hoveredProjectId.value = null;
  handleMouseLeaveVideo(project.id, event);
};

const handleProjectOpen = (project: CaptureProject) => {
  selectProject(project);
  openSelectedProject();
};

onMounted(() => {
  void loadProjects();
});

onUnmounted(() => {
  if (scrollTimeout) clearTimeout(scrollTimeout);
  if (refreshSuccessTimeout) clearTimeout(refreshSuccessTimeout);
  // Stop all video elements to prevent holding media resources/decoders when closing
  const container = document.querySelector('.projects-viewport');
  if (container) {
    const videos = container.querySelectorAll('video');
    videos.forEach((v) => {
      v.pause();
      v.src = '';
      v.load();
    });
  }
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
const deleteProjectName = ref('');
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
    await capture.renameProject(renameProjectId.value, trimmed);
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
  deleteProjectName.value = project.name;
  deleteError.value = '';
  deleteConfirmProjectId.value = project.id;
};

const handleDeleteProject = async () => {
  deleteBusy.value = true;
  deleteError.value = '';
  try {
    await capture.deleteProject(deleteProjectId.value);
    cachedProjects = null;
    await loadProjects();
    deleteConfirmProjectId.value = null;

    // If the currently selected project was deleted, pick the first remaining one
    if (selectedProjectId.value === deleteProjectId.value) {
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
  void capture.revealProject(project.id);
};

defineExpose({
  refresh: loadProjects,
  invalidate: () => {
    cachedProjects = null;
  },
});
</script>

<template>
  <section class="project-picker" :class="{ compact }" aria-labelledby="project-picker-title">
    <div class="project-picker-heading">
      <div>
        <h1 id="project-picker-title">{{ t('projects') }}</h1>
        <p>
          {{ compact ? t('switchProject') : t('chooseRecording') }}
        </p>
      </div>
      <div class="heading-actions">
        <ButtonGroup size="xs" class="heading-actions-group">
          <Button
            variant="ghost"
            size="xs"
            class="search-toggle-button"
            :class="{ 'is-active': isSearchOpen }"
            :icon="Search"
            icon-only
            :aria-label="t('searchProjects')"
            :tooltip="t('searchProjects')"
            @click="toggleSearch"
          />
          <Divider orientation="vertical" spacing="none" />
          <Button
            variant="ghost"
            size="xs"
            class="select-toggle-button"
            :class="{ 'is-active': isSelectionMode }"
            :icon="CheckSquare"
            icon-only
            :aria-label="isSelectionMode ? t('exitSelectionMode') : t('selectProjects')"
            :tooltip="isSelectionMode ? t('exitSelectionMode') : t('selectProjects')"
            @click="toggleSelectionMode"
          />
          <Divider orientation="vertical" spacing="none" />
          <Button
            variant="ghost"
            size="xs"
            class="new-project-button"
            :icon="Plus"
            icon-only
            :aria-label="t('newProject')"
            :tooltip="t('newProject')"
            @click="openNewProjectDialog"
          />
          <Divider orientation="vertical" spacing="none" />
          <Button
            variant="ghost"
            size="xs"
            class="refresh-button"
            :class="{ 'is-success': isRefreshSuccess }"
            :icon="isRefreshSuccess ? Check : RefreshCw"
            icon-only
            :loading="isRefreshing"
            :aria-label="isRefreshSuccess ? t('refreshed') : t('refreshProjects')"
            :tooltip="isRefreshSuccess ? t('refreshed') : t('refreshProjects')"
            @click="handleRefresh"
          />
        </ButtonGroup>
      </div>
    </div>

    <BlurRevealTransition transition-mode="out-in">
      <div v-if="isSelectionMode" class="project-selection-bar">
        <div class="selection-bar-left">
          <Checkbox
            size="sm"
            :model-value="isAllSelected"
            :indeterminate="isSomeSelected"
            :label="
              selectedBatchIds.size > 0
                ? `${selectedBatchIds.size} ${selectedBatchIds.size === 1 ? t('selected') : t('selected')}`
                : t('selectAll')
            "
            @change="toggleSelectAll"
          />
        </div>
        <div class="selection-bar-right">
          <Button variant="ghost" size="xs" :tooltip="t('cancel')" @click="cancelSelectionMode">
            {{ t('cancel') }}
          </Button>
          <Button
            variant="danger"
            size="xs"
            :icon="Trash2"
            :disabled="selectedBatchIds.size === 0"
            :loading="isDeletingBatch"
            :tooltip="t('delete')"
            @click="handleDeleteBatch"
          >
            {{ t('delete') }} ({{ selectedBatchIds.size }})
          </Button>
        </div>
      </div>
      <div v-else-if="isSearchOpen" class="project-search-bar">
        <Input
          ref="searchInputRef"
          v-model="searchQuery"
          size="sm"
          class="project-search-input"
          :placeholder="t('searchPlaceholder')"
          @keydown="handleSearchKeydown"
        >
          <template #prefix>
            <Search class="search-field-icon" />
          </template>
          <template #suffix>
            <button
              v-if="searchQuery"
              type="button"
              class="search-clear-btn"
              :aria-label="t('clearSearch')"
              @click="clearSearch"
            >
              <X />
            </button>
          </template>
        </Input>
      </div>
    </BlurRevealTransition>

    <div v-if="isLoading" class="project-grid project-skeleton-grid" :aria-label="t('loadingProjects')">
      <div v-for="index in 6" :key="index" class="project-card-skeleton">
        <Skeleton
          class="project-skeleton-preview"
          variant="linear"
          height="72px"
          radius="var(--radius-md) var(--radius-md) 0 0"
        />
        <div class="project-card-skeleton-content">
          <Skeleton class="project-skeleton-line title" variant="linear" width="72%" height="10px" />
          <Skeleton class="project-skeleton-line meta" variant="linear" width="46%" height="8px" />
        </div>
      </div>
    </div>

    <div v-else-if="errorMessage" class="project-state project-error" role="alert">
      <p>{{ errorMessage }}</p>
      <Button variant="link" size="sm" @click="loadProjects">{{ t('tryAgain') }}</Button>
    </div>

    <div v-else-if="projects.length === 0" class="project-state">
      <Film class="empty-icon" />
      <p>{{ t('noProjects') }}</p>
      <span>{{ t('recordDemoFirst') }}</span>
    </div>

    <div v-else-if="filteredProjects.length === 0" class="project-state search-empty-state">
      <Search class="empty-icon" />
      <p>{{ t('noSearchResults') }}</p>
      <Button variant="link" size="sm" @click="clearSearch">{{ t('clearSearch') }}</Button>
    </div>

    <div
      v-else
      v-bind="containerProps"
      class="projects-viewport"
      :class="{ 'is-scrolling': isScrolling, 'is-refreshing': isRefreshing }"
      :style="maskStyle"
      @scroll.passive="handleScroll"
    >
      <div v-bind="wrapperProps" class="projects-list">
        <div v-for="row in list" :key="row.index" class="project-grid project-row">
          <div
            v-for="project in row.data"
            :key="project.id"
            class="project-card-container"
            :data-project-id="project.id"
          >
            <div
              class="btn btn-card project-card"
              :class="{
                'is-selected': isSelectionMode ? selectedBatchIds.has(project.id) : project.id === selectedProjectId,
                'is-selection-mode': isSelectionMode,
              }"
              :aria-pressed="isSelectionMode ? selectedBatchIds.has(project.id) : project.id === selectedProjectId"
              role="button"
              tabindex="0"
              @mouseenter="handleProjectMouseEnter(project, $event)"
              @mouseleave="handleProjectMouseLeave(project, $event)"
              @click="isSelectionMode ? toggleBatchSelect(project.id) : selectProject(project)"
              @dblclick="isSelectionMode ? toggleBatchSelect(project.id) : handleProjectOpen(project)"
              @keydown.enter.self="isSelectionMode ? toggleBatchSelect(project.id) : handleProjectOpen(project)"
              @keydown.space.self="isSelectionMode ? toggleBatchSelect(project.id) : selectProject(project)"
            >
              <div class="project-preview project-card-media">
                <img
                  v-if="thumbnailCache[project.id] || project.thumbnailSrc"
                  :src="thumbnailCache[project.id] || project.thumbnailSrc!"
                  class="project-preview-thumb"
                  :alt="t('preview')"
                />
                <Skeleton v-else class="project-preview-skeleton" variant="linear" height="100%" width="100%" />
                <video
                  v-if="project.previewSrc && hoveredProjectId === project.id"
                  :src="project.previewSrc"
                  autoplay
                  muted
                  loop
                  playsinline
                  preload="auto"
                  class="project-preview-video"
                  :class="{ 'is-loaded': isVideoLoaded[project.id] }"
                  @loadeddata="isVideoLoaded[project.id] = true"
                  @playing="isVideoLoaded[project.id] = true"
                  @timeupdate="handleVideoTimeUpdate(project.id, $event)"
                />
                <ProjectFeatureBadges :project="project" />
                <template v-if="!isSelectionMode">
                  <span v-if="project.id === currentProjectId" class="current-indicator" :aria-label="t('current')">
                    {{ t('current') }}
                  </span>
                  <span
                    v-else-if="project.id === selectedProjectId"
                    class="selected-indicator"
                    :aria-label="t('selected')"
                  >
                    <Check />
                  </span>
                </template>
                <div v-if="project.previewSrc && videoProgress[project.id]" class="preview-progress-overlay">
                  <ProgressBar :value="videoProgress[project.id].current" :max="videoProgress[project.id].total" />
                </div>
              </div>
              <div class="project-card-info">
                <div class="project-title-row">
                  <BlurRevealTransition mode="horizontal">
                    <Checkbox
                      v-if="isSelectionMode"
                      size="sm"
                      class="project-title-checkbox"
                      :model-value="selectedBatchIds.has(project.id)"
                      :aria-label="project.name"
                      @click.stop
                      @change="toggleBatchSelect(project.id)"
                    />
                  </BlurRevealTransition>
                  <Input
                    v-if="renameProjectId === project.id"
                    autofocus
                    select-on-focus
                    v-model="renameValue"
                    size="sm"
                    class="project-rename-input"
                    :disabled="renameBusy"
                    @click.stop
                    @mousedown.stop
                    @keydown.enter.stop="handleRenameProject"
                    @keydown.esc.stop="cancelRename"
                    @blur="handleRenameProject"
                  />
                  <span v-else class="project-card-name" :title="project.name">{{ project.name }}</span>
                  <div
                    v-if="renameProjectId !== project.id && !isSelectionMode"
                    class="project-card-actions"
                    @click.stop
                    @mousedown.stop
                  >
                    <Popover
                      align="right"
                      direction="down"
                      :match-trigger-width="false"
                      @toggle="handleActionPopoverToggle"
                    >
                      <template #trigger="{ isOpen }">
                        <Button
                          variant="ghost"
                          size="sm"
                          icon-only
                          :icon="MoreVertical"
                          class="action-trigger-btn"
                          :class="{ 'is-open': isOpen }"
                        />
                      </template>
                      <template #default="{ close }">
                        <div class="action-menu-content">
                          <template v-if="deleteConfirmProjectId === project.id">
                            <p class="delete-confirm-text">
                              {{ t('deleteConfirm', { name: project.name }) }}
                            </p>
                            <p v-if="deleteError" class="delete-confirm-error">
                              {{ deleteError }}
                            </p>
                            <div class="delete-confirm-actions">
                              <Button
                                variant="ghost"
                                size="sm"
                                :disabled="deleteBusy"
                                @click.stop="
                                  deleteConfirmProjectId = null;
                                  deleteError = '';
                                "
                                >{{ t('cancel') }}</Button
                              >
                              <Button
                                variant="danger"
                                size="sm"
                                :loading="deleteBusy"
                                @click.stop="handleDeleteProject().then(() => close())"
                                >{{ t('delete') }}</Button
                              >
                            </div>
                          </template>
                          <template v-else>
                            <Button
                              variant="ghost"
                              size="sm"
                              :icon="Pencil"
                              class="menu-action-item"
                              @click.stop="
                                startRename(project);
                                close();
                              "
                            >
                              {{ t('rename') }}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              :icon="ExternalLink"
                              class="menu-action-item"
                              @click.stop="
                                revealProjectFolder(project);
                                close();
                              "
                            >
                              {{ t('explore') }}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              :icon="Trash2"
                              class="menu-action-item delete-item"
                              @click.stop="confirmDeleteProject(project)"
                            >
                              {{ t('delete') }}
                            </Button>
                          </template>
                        </div>
                      </template>
                    </Popover>
                  </div>
                </div>
                <span class="project-card-meta">
                  {{ project.sessionCount }}
                  {{ project.sessionCount === 1 ? t('session') : t('sessions') }}
                  ·
                  {{ formatDate(project.updatedAt) }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <footer v-if="!compact" class="project-picker-footer">
      <ButtonGroup class="project-footer-actions">
        <Button variant="ghost" size="sm" class="back-project-button" :icon="ArrowLeft" @click="emit('back')">
          {{ t('back') }}
        </Button>
        <Button
          variant="primary"
          size="sm"
          :icon="FolderOpen"
          :disabled="!selectedProject || selectedProject.id === currentProjectId || isSelectionMode"
          @click="openSelectedProject"
        >
          {{ t('openProject') }}
        </Button>
      </ButtonGroup>
    </footer>

    <!-- New Project Dialog -->
    <Dialog :is-open="isNewProjectOpen" :title="t('newProject')" size="sm" @close="isNewProjectOpen = false">
      <div style="display: flex; flex-direction: column; gap: 12px; padding: 4px 0">
        <Input
          v-model="newProjectName"
          :placeholder="t('projectName')"
          :disabled="newProjectBusy"
          autofocus
          @keyup.enter="handleCreateProject"
        />
        <p v-if="newProjectError" style="color: var(--color-error); font-size: 11px; margin: 0">
          {{ newProjectError }}
        </p>
      </div>
      <template #footer="{ close }">
        <ButtonGroup>
          <Button variant="ghost" size="sm" :disabled="newProjectBusy" @click="close">{{ t('cancel') }}</Button>
          <Button variant="primary" size="sm" :loading="newProjectBusy" @click="handleCreateProject">{{
            t('create')
          }}</Button>
        </ButtonGroup>
      </template>
    </Dialog>
  </section>
</template>

<style scoped>
.project-picker {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px 0 16px 16px;
  overflow: hidden;
}

.project-picker.compact {
  height: 336px;
  flex: none;
  padding: 12px 0 12px 12px;
}

.project-picker.compact .project-picker-heading h1 {
  font-size: 15px;
}

.project-picker.compact .project-picker-heading p {
  font-size: 10px;
}

.project-picker-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
  padding-right: 16px;
  margin-bottom: 12px;
}

.project-picker.compact .project-picker-heading {
  padding-right: 12px;
  margin-bottom: 8px;
}

.heading-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.search-toggle-button.is-active,
.select-toggle-button.is-active {
  color: var(--color-primary);
  background: var(--color-primary-light);
}

.refresh-button.is-success {
  color: var(--color-success) !important;
}

.project-selection-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 3px 6px;
  background: var(--color-bg-surface-hover);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  margin-right: 16px;
  margin-bottom: 12px;
  height: 32px;
  box-sizing: border-box;
  overflow: hidden;
  transform: translate3d(0, 0, 0);
  backface-visibility: hidden;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.project-picker.compact .project-selection-bar {
  padding: 2px 6px;
  margin-right: 12px;
  margin-bottom: 8px;
  height: 28px;
}

.selection-bar-left {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-left: 2px;
  min-width: 0;
  flex: 1;
  overflow: hidden;
}

.selection-bar-right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.project-search-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  margin-right: 16px;
  margin-bottom: 12px;
  height: 32px;
  box-sizing: border-box;
  overflow: hidden;
  transform: translate3d(0, 0, 0);
  backface-visibility: hidden;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.project-picker.compact .project-search-bar {
  margin-right: 12px;
  margin-bottom: 8px;
  height: 28px;
}

.project-search-input {
  width: 100%;
}

.search-field-icon {
  width: 13px;
  height: 13px;
  color: var(--text-muted);
}

.search-clear-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: var(--radius-full);
  color: var(--text-muted);
  cursor: pointer;
  transition: color var(--fast) ease;
}

.search-clear-btn:hover {
  color: var(--text-primary);
}

.search-clear-btn svg {
  width: 12px;
  height: 12px;
}

.project-picker-heading h1 {
  color: var(--text-primary);
  font-size: 18px;
  letter-spacing: -0.4px;
}

.project-picker-heading p {
  margin-top: 2px;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.35;
}

.projects-viewport {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px 12px 4px 4px;
  transform: translate3d(0, 0, 0);
  backface-visibility: hidden;
  transition:
    filter 0.35s cubic-bezier(0.16, 1, 0.3, 1),
    opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

.projects-viewport.is-refreshing {
  filter: blur(6px);
  opacity: 0.55;
  transform: scale(0.985);
  pointer-events: none;
}

.project-picker.compact .projects-viewport {
  padding: 4px 8px 4px 4px;
}

.projects-list {
  width: 100%;
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.project-row {
  height: 132px;
  margin-bottom: 12px;
}

.compact .project-row {
  height: 116px;
  margin-bottom: 12px;
}

.project-card-container {
  position: relative;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.project-card,
.project-card-skeleton {
  min-width: 0;
  overflow: visible;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-element);
}

.project-card:hover {
  transform: none !important;
}

:deep(.btn-card):hover:not(.is-selected) {
  border-color: var(--color-primary-hover) !important;
}

:deep(.btn-card.is-selected),
:deep(.btn-card.is-selected):hover,
.project-card.is-selected,
.project-card.is-selected:hover {
  border-color: var(--color-primary) !important;
  box-shadow: 0 0 0 2px var(--color-primary-light) !important;
}

.project-card-actions {
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.2s ease;
  z-index: 10;
}

.project-card-container:hover .project-card-actions,
.project-card-actions:focus-within,
.project-card-actions.is-open {
  opacity: 1;
}

.action-trigger-btn {
  width: 18px !important;
  height: 18px !important;
  border-radius: 4px !important;
  background: transparent !important;
  border: none !important;
  color: var(--text-muted) !important;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 !important;
  box-shadow: none !important;
}

.action-trigger-btn:hover,
.action-trigger-btn.is-open {
  background: var(--color-bg-surface-hover) !important;
  color: var(--text-primary) !important;
}

.action-menu-content {
  display: flex;
  flex-direction: column;
  padding: 4px;
  gap: 2px;
}

.action-menu-content :deep(.menu-action-item) {
  width: 100% !important;
  justify-content: flex-start !important;
  padding: 0.4rem 0.8rem !important;
  font-size: 0.8rem !important;
  border-radius: 6px !important;
  border: none !important;
  border-color: transparent !important;
  font-weight: 500 !important;
  box-shadow: none !important;
}

.action-menu-content :deep(.menu-action-item:hover) {
  background: var(--color-bg-surface-hover) !important;
  color: var(--text-primary) !important;
}

.action-menu-content :deep(.menu-action-item.delete-item) {
  color: var(--color-error) !important;
}

.action-menu-content :deep(.menu-action-item.delete-item:hover) {
  background: var(--color-error-light, rgba(239, 68, 68, 0.15)) !important;
  color: var(--color-error) !important;
}

.delete-confirm-text {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
  margin: 0 0 6px 0;
  padding: 0 2px;
}

.delete-confirm-error {
  font-size: 11px;
  color: var(--color-error);
  margin: 0 0 6px 0;
  padding: 0 2px;
}

.delete-confirm-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}

.project-preview {
  position: relative;
  width: 100%;
  height: 72px;
  background: var(--color-bg-surface);
  overflow: hidden;
  border-top-left-radius: calc(var(--radius-md) - 1px);
  border-top-right-radius: calc(var(--radius-md) - 1px);
}

.project-preview-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  background-color: transparent;
  transition: opacity 0.2s ease;
  z-index: 3;
  border-top-left-radius: calc(var(--radius-md) - 1px);
  border-top-right-radius: calc(var(--radius-md) - 1px);
}

.project-preview-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  border-top-left-radius: calc(var(--radius-md) - 1px);
  border-top-right-radius: calc(var(--radius-md) - 1px);
}

.project-preview-video.is-loaded {
  opacity: 1;
}

.project-preview-skeleton {
  position: absolute;
  inset: 0;
  z-index: 2;
  border-top-left-radius: calc(var(--radius-md) - 1px);
  border-top-right-radius: calc(var(--radius-md) - 1px);
}

.project-preview video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-top-left-radius: calc(var(--radius-md) - 1px);
  border-top-right-radius: calc(var(--radius-md) - 1px);
}

.preview-placeholder-icon {
  width: 22px;
  height: 22px;
  color: var(--text-muted, #71717a); /* Neutral text color */
}

.preview-progress-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 10;
}

.current-indicator {
  position: absolute;
  top: 5px;
  right: 5px;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  background: var(--color-primary);
  color: #ffffff;
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  z-index: 3;
}

.selected-indicator {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: white;
  background: var(--color-primary);
}

.selected-indicator svg {
  width: 12px;
  height: 12px;
}

.project-card-info {
  display: flex;
  flex-direction: column;
  padding: 2px 7px 3px;
  min-width: 0;
  width: 100%;
  gap: 0;
  line-height: 1.1;
}

.project-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-width: 0;
  gap: 0;
  min-height: 18px;
}

.project-title-checkbox {
  flex-shrink: 0;
  margin-right: 4px;
}

.project-card-name,
.project-card-meta {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  width: 100%;
  text-align: left;
}

.project-card-name {
  font-size: 11px;
  font-weight: 700;
  flex: 1;
  line-height: 1.2;
  transform: translate3d(0, 0, 0);
  will-change: transform;
}

.project-rename-input {
  flex: 1;
  font-size: 11px;
  font-weight: 700;
  height: 20px !important;
  padding: 0 4px !important;
  border-radius: 4px !important;
  min-width: 0;
}

.project-rename-input :deep(.input-element) {
  font-size: 11px !important;
  font-weight: 700 !important;
}

.project-card-meta {
  padding-top: 0;
  color: var(--text-muted);
  font-size: 9px;
  line-height: 1.1;
}

.project-skeleton-grid {
  flex: 1;
  align-content: start;
  overflow: hidden;
}

.project-card-skeleton {
  height: 124px;
}

.project-card-skeleton-content {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 8px;
}

.project-skeleton-preview {
  display: block;
}

.project-skeleton-line {
  display: block;
}

.project-state {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  color: var(--text-muted);
  text-align: center;
  font-size: 12px;
}

.project-state span {
  font-size: 10px;
}

.project-error p {
  max-width: 240px;
  color: var(--color-error);
  font-size: 11px;
  line-height: 1.35;
}

.empty-icon {
  width: 24px;
  height: 24px;
  margin-bottom: 3px;
  color: var(--text-muted);
}

.project-picker-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
  margin-top: 12px;
}

.compact .project-picker-footer {
  margin-top: 8px;
}

.project-footer-actions {
  width: 100%;
}

.back-project-button {
  padding-left: 0;
}

@media (prefers-reduced-motion: reduce) {
  .project-card {
    animation: none;
    transition: none;
  }
}
</style>
