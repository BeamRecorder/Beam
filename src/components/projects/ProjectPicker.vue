<script setup lang="ts">
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
import ProjectCreateDialog from './ProjectCreateDialog.vue';
import Popover from '~/ui/popover/Popover.vue';
import Input from '~/ui/input/Input.vue';
import Skeleton from '~/ui/skeleton/Skeleton.vue';
import ProgressBar from '../ui/progressbar/ProgressBar.vue';
import BlurRevealTransition from '~/ui/transitions/BlurRevealTransition.vue';
import ProjectFeatureBadges from '../projects/ProjectFeatureBadges.vue';

import ProjectModeIcon from './ProjectModeIcon.vue';
import { useProjectPicker } from './useProjectPicker';
import type { ProjectPickerProps, ProjectPickerEvents } from './project-picker-types';
const props = withDefaults(defineProps<Partial<ProjectPickerProps>>(), { compact: false, currentProjectId: null });
const emit = defineEmits<ProjectPickerEvents>();
const {
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
  thumbnailCache,
  hoveredProjectId,
  videoProgress,
  isVideoLoaded,
  isScrolling,
  handleScroll,
  handleVideoTimeUpdate,
  handleProjectMouseEnter,
  handleProjectMouseLeave,
  invalidate,
} = useProjectPicker(props, emit);
defineExpose({ refresh: loadProjects, invalidate });
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
          :ref="(element) => (searchInputRef = element as InstanceType<typeof Input> | null)"
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
                  <ProjectModeIcon :mode="project.mode" />
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

    <ProjectCreateDialog
      v-model:open="isNewProjectOpen"
      v-model:name="newProjectName"
      :busy="newProjectBusy"
      :error="newProjectError"
      @create="handleCreateProject"
    />
  </section>
</template>

<style scoped src="./project-picker.css" />
<style scoped src="./project-card.css" />
