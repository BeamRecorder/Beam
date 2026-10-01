import { ref, type CSSProperties, type Ref } from 'vue';

export function useSidebarSelectionIndicator(sidebarRef: Ref<HTMLElement | null>) {
  const style = ref<CSSProperties | null>(null);
  const instant = ref(true);

  const update = (animate = false) => {
    const sidebar = sidebarRef.value;
    const selected = sidebar?.querySelector<HTMLElement>('.nav-btn.active');
    if (!sidebar || !selected || !sidebar.offsetWidth || !sidebar.offsetHeight) {
      style.value = null;
      return;
    }
    const sidebarBounds = sidebar.getBoundingClientRect();
    const bounds = selected.getBoundingClientRect();
    if (!sidebarBounds.width || !sidebarBounds.height || !bounds.width || !bounds.height) {
      style.value = null;
      return;
    }
    const scaleX = sidebarBounds.width / sidebar.offsetWidth;
    const scaleY = sidebarBounds.height / sidebar.offsetHeight;
    const viewport = selected.closest<HTMLElement>('.sidebar-viewport');
    const viewportBounds = viewport?.getBoundingClientRect();
    const clippedTop = viewportBounds ? Math.max(0, viewportBounds.top - bounds.top) : 0;
    const clippedBottom = viewportBounds ? Math.max(0, bounds.bottom - viewportBounds.bottom) : 0;
    if (clippedTop + clippedBottom >= bounds.height) {
      style.value = null;
      return;
    }
    instant.value = !animate || style.value === null;
    style.value = {
      width: `${bounds.width / scaleX}px`,
      height: `${bounds.height / scaleY}px`,
      transform: `translate3d(${(bounds.left - sidebarBounds.left) / scaleX}px, ${(bounds.top - sidebarBounds.top) / scaleY}px, 0)`,
      clipPath: `inset(${clippedTop / scaleY}px 0px ${clippedBottom / scaleY}px 0px)`,
    };
  };

  return { style, instant, update };
}
