<script setup lang="ts">
import { computed } from 'vue';
import { Search, RefreshCw, Plus, MoreVertical, ExternalLink, Pencil, Trash2 } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Popover from '~/ui/popover/Popover.vue';
import ProjectTitle from '../../../apps/desktop/src/components/projects/ProjectTitle.vue';
import ProjectPreviewImage from '../../../apps/desktop/src/components/projects/ProjectPreviewImage.vue';
import ProjectModeIcon from '../../../apps/desktop/src/components/projects/ProjectModeIcon.vue';
import ProjectFeatureBadges from '../../../apps/desktop/src/components/projects/ProjectFeatureBadges.vue';
import FolderScene from './FolderScene.vue';
import catalog from '../assets/projects.json';
import { stateAt } from './motion';
import type { CatalogProject, DemoPose } from './demo-types';
const projects = catalog as CatalogProject[];
const props = defineProps<{ pose: DemoPose }>();
const state = computed(() => stateAt(props.pose.time));
const images = import.meta.glob('../assets/project-*.webp', { eager: true, import: 'default' }) as Record<
  string,
  string
>;
</script>
<template>
  <div class="projects-host native-window" :style="{ opacity: 1 - state.folder * 0.45 }">
    <section class="project-picker" style="height: 100%; --project-columns: 3">
      <div class="project-picker-heading">
        <div>
          <h1>Projects</h1>
          <p>Choose a project to continue editing.</p>
        </div>
        <div class="heading-actions">
          <Button variant="ghost" size="xs" :icon="Search" icon-only aria-label="Search projects" />
          <Button variant="ghost" size="xs" :icon="RefreshCw" icon-only aria-label="Refresh projects" />
          <Button variant="primary" size="xs" :icon="Plus">New project</Button>
        </div>
      </div>
      <div class="projects-viewport">
        <div class="project-grid">
          <div
            v-for="(project, i) in projects"
            :key="project.id"
            class="project-card-container"
            :data-project-id="project.id"
          >
            <div
              class="btn btn-card project-card"
              :class="{ 'is-selected': i === 0 && state.selected }"
              role="button"
              tabindex="0"
              :aria-label="project.name"
              :aria-pressed="i === 0 && state.selected"
            >
              <div class="project-preview">
                <ProjectPreviewImage
                  :src="images['../assets/' + project.image]"
                  :alt="project.name"
                /><ProjectFeatureBadges :project="project" />
              </div>
              <div class="project-card-info">
                <div class="project-title-row">
                  <ProjectModeIcon mode="studio" /><ProjectTitle :project="project" :selection-mode="false" />
                  <div v-if="i === 0" class="project-card-actions" style="opacity: 1">
                    <Popover align="right" direction="down" :match-trigger-width="false">
                      <template #trigger="{ isOpen }"
                        ><Button
                          variant="ghost"
                          size="sm"
                          icon-only
                          :icon="MoreVertical"
                          class="action-trigger-btn"
                          style="width: 18px; height: 18px; padding: 0; border: 0; background: transparent"
                          aria-label="Project actions"
                          :aria-expanded="isOpen"
                      /></template>
                      <div class="action-menu-content">
                        <Button variant="ghost" size="sm" :icon="Pencil" class="menu-action-item">Rename</Button
                        ><Button
                          variant="ghost"
                          size="sm"
                          :icon="ExternalLink"
                          class="menu-action-item"
                          aria-label="Explore"
                          >Explore</Button
                        ><Button variant="ghost" size="sm" :icon="Trash2" class="menu-action-item delete-item"
                          >Delete</Button
                        >
                      </div>
                    </Popover>
                  </div>
                </div>
                <span class="project-card-meta">{{
                  new Date(project.updatedAt).toLocaleDateString('en-GB', {
                    timeZone: 'UTC',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })
                }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
  <FolderScene :progress="state.folder" :selected="state.sourceSelected" />
</template>
<style scoped src="../../../apps/desktop/src/components/projects/project-picker.css"></style>
<style scoped src="../../../apps/desktop/src/components/projects/project-card.css"></style>
