import { ref, nextTick, onBeforeUnmount, type Ref } from 'vue';
import type { CaptureProject } from '~/api/types/capture-api';
import { useProjectThumbnailGenerator } from '../hud/useProjectThumbnailGenerator';

export function useProjectPreviews(container: Ref<HTMLElement | null>) {
  const hoveredProjectId = ref<string | null>(null);
  const { thumbnailCache, generateThumbnail } = useProjectThumbnailGenerator();

  const generateThumbnailsForProjects = async (projectList: CaptureProject[]) => {
    for (const project of projectList) {
      if (project.previewSrc && !project.thumbnailSrc && !thumbnailCache[project.id]) {
        void generateThumbnail(project.id, project.previewSrc);
      }
    }
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

  onBeforeUnmount(() => {
    if (scrollTimeout) clearTimeout(scrollTimeout);
    container.value?.querySelectorAll('video').forEach((video) => {
      video.pause();
      video.removeAttribute('src');
      video.load();
    });
  });

  return {
    thumbnailCache,
    generateThumbnailsForProjects,
    hoveredProjectId,
    videoProgress,
    isVideoLoaded,
    isScrolling,
    handleScroll,
    handleVideoTimeUpdate,
    handleProjectMouseEnter,
    handleProjectMouseLeave,
  };
}
