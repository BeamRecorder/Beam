import { ref, nextTick, onBeforeUnmount, watch, type Ref } from 'vue';
import type { CaptureProject } from '~/api/types/capture-api';
import { useProjectThumbnailGenerator } from '../hud/useProjectThumbnailGenerator';

export function useProjectPreviews(container: Ref<HTMLElement | null>, visibleProjects: Ref<CaptureProject[]>) {
  const hoveredProjectId = ref<string | null>(null);
  const { thumbnailCache, generateThumbnail } = useProjectThumbnailGenerator();

  let disposed = false;
  const active = new Set<string>();
  const MAX_DECODERS = 2;
  const attempted = new Map<string, string>();
  const generateVisibleThumbnails = () => {
    while (!disposed && active.size < MAX_DECODERS) {
      const project = visibleProjects.value.find(
        (candidate) =>
          candidate.previewSrc &&
          !candidate.thumbnailSrc &&
          !thumbnailCache[candidate.id] &&
          !active.has(candidate.id) &&
          attempted.get(candidate.id) !== candidate.previewSrc,
      );
      if (!project?.previewSrc) break;
      attempted.set(project.id, project.previewSrc);
      active.add(project.id);
      void generateThumbnail(project.id, project.previewSrc).finally(() => {
        active.delete(project.id);
        generateVisibleThumbnails();
      });
    }
  };
  watch(visibleProjects, generateVisibleThumbnails, { immediate: true });
  const retryVisibleThumbnails = () => {
    attempted.clear();
    void generateVisibleThumbnails();
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

  const handleMouseEnterVideo = (projectId: string, event: MouseEvent) => {
    const target = event.currentTarget as HTMLElement | null;
    void nextTick(() => {
      if (disposed || hoveredProjectId.value !== projectId) return;
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
  watch(visibleProjects, (projects) => {
    if (!projects.some((project) => project.id === hoveredProjectId.value)) hoveredProjectId.value = null;
  });
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
    disposed = true;
    if (scrollTimeout) clearTimeout(scrollTimeout);
    container.value?.querySelectorAll('video').forEach((video) => {
      video.pause();
      video.removeAttribute('src');
      video.load();
    });
  });

  return {
    thumbnailCache,
    hoveredProjectId,
    videoProgress,
    isVideoLoaded,
    isScrolling,
    handleScroll,
    handleVideoTimeUpdate,
    handleProjectMouseEnter,
    handleProjectMouseLeave,
    retryVisibleThumbnails,
  };
}
