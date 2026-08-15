import {
  ref,
  computed,
  onMounted,
  onBeforeUnmount,
  getCurrentInstance,
  type Ref,
  type ComputedRef,
  type WritableComputedRef,
} from 'vue';
import type { HudNavigationEntry, HudSettingsView } from './hud-navigation-types';

export function areHudEntriesEqual(a: HudNavigationEntry, b: HudNavigationEntry): boolean {
  if (a.view !== b.view) return false;
  if (a.view === 'settings' && b.view === 'settings') {
    return a.subview === b.subview;
  }
  return true;
}

export interface UseHudNavigationOptions {
  initialEntry?: HudNavigationEntry;
  attachListeners?: boolean;
}

export interface UseHudNavigationReturn {
  history: Ref<HudNavigationEntry[]>;
  currentIndex: Ref<number>;
  currentEntry: ComputedRef<HudNavigationEntry>;
  showSettings: WritableComputedRef<boolean>;
  settingsView: WritableComputedRef<HudSettingsView>;
  showProjectPicker: WritableComputedRef<boolean>;
  canGoBack: ComputedRef<boolean>;
  canGoForward: ComputedRef<boolean>;
  navigateTo: (entry: HudNavigationEntry) => void;
  openHud: () => void;
  openProjects: () => void;
  openSettings: (subview?: HudSettingsView) => void;
  setSettingsView: (subview: HudSettingsView) => void;
  goBack: () => boolean;
  goForward: () => boolean;
  handleTopbarBack: () => void;
  handleMouseNavigation: (event: MouseEvent) => boolean;
  attachWindowListeners: () => void;
  detachWindowListeners: () => void;
}

export function useHudNavigation(options: UseHudNavigationOptions = {}): UseHudNavigationReturn {
  const initial = options.initialEntry ?? { view: 'hud' };
  const history = ref<HudNavigationEntry[]>([initial]);
  const currentIndex = ref<number>(0);

  const currentEntry = computed<HudNavigationEntry>(() => {
    return history.value[currentIndex.value] ?? { view: 'hud' };
  });

  const canGoBack = computed(() => currentIndex.value > 0);
  const canGoForward = computed(() => currentIndex.value < history.value.length - 1);

  const navigateTo = (entry: HudNavigationEntry) => {
    if (areHudEntriesEqual(currentEntry.value, entry)) {
      return;
    }
    const truncated = history.value.slice(0, currentIndex.value + 1);
    truncated.push(entry);
    history.value = truncated;
    currentIndex.value = truncated.length - 1;
  };

  const openHud = () => {
    navigateTo({ view: 'hud' });
  };

  const openProjects = () => {
    navigateTo({ view: 'projects' });
  };

  const openSettings = (subview: HudSettingsView = 'general') => {
    navigateTo({ view: 'settings', subview });
  };

  const setSettingsView = (subview: HudSettingsView) => {
    if (currentEntry.value.view === 'settings') {
      navigateTo({ view: 'settings', subview });
    }
  };

  const goBack = (): boolean => {
    if (canGoBack.value) {
      currentIndex.value -= 1;
      return true;
    }
    return false;
  };

  const goForward = (): boolean => {
    if (canGoForward.value) {
      currentIndex.value += 1;
      return true;
    }
    return false;
  };

  const goBackOrToHud = () => {
    if (canGoBack.value && history.value[currentIndex.value - 1].view === 'hud') {
      goBack();
    } else {
      openHud();
    }
  };

  const showSettings = computed<boolean>({
    get: () => currentEntry.value.view === 'settings',
    set: (val: boolean) => {
      if (val) {
        openSettings('general');
      } else if (currentEntry.value.view === 'settings') {
        goBackOrToHud();
      }
    },
  });

  const settingsView = computed<HudSettingsView>({
    get: () => (currentEntry.value.view === 'settings' ? currentEntry.value.subview : 'general'),
    set: (val: HudSettingsView) => {
      setSettingsView(val);
    },
  });

  const showProjectPicker = computed<boolean>({
    get: () => currentEntry.value.view === 'projects',
    set: (val: boolean) => {
      if (val) {
        openProjects();
      } else if (currentEntry.value.view === 'projects') {
        goBackOrToHud();
      }
    },
  });

  const handleTopbarBack = () => {
    if (canGoBack.value) {
      goBack();
      return;
    }
    if (currentEntry.value.view === 'projects') {
      openHud();
    } else if (currentEntry.value.view === 'settings') {
      if (currentEntry.value.subview !== 'general') {
        history.value = [{ view: 'hud' }, { view: 'settings', subview: 'general' }];
        currentIndex.value = 1;
      } else {
        openHud();
      }
    }
  };

  const isEditableTarget = (target: EventTarget | null) =>
    target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));

  const handleMouseNavigation = (event: MouseEvent): boolean => {
    if (isEditableTarget(event.target)) return false;
    if (event.button === 3) {
      event.preventDefault();
      event.stopPropagation();
      return goBack();
    }
    if (event.button === 4) {
      event.preventDefault();
      event.stopPropagation();
      return goForward();
    }
    return false;
  };

  let lastNavTime = 0;
  let lastButton = -1;

  const onMouseEvent = (event: MouseEvent) => {
    if (event.button === 3 || event.button === 4) {
      if (isEditableTarget(event.target)) return;
      const now = Date.now();
      if (event.button === lastButton && now - lastNavTime < 150) {
        return;
      }
      lastNavTime = now;
      lastButton = event.button;
      handleMouseNavigation(event);
    }
  };

  const onAuxClick = (event: MouseEvent) => {
    if ((event.button === 3 || event.button === 4) && !isEditableTarget(event.target)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  let listenersAttached = false;
  const attachWindowListeners = () => {
    if (typeof window === 'undefined' || listenersAttached) return;
    window.addEventListener('pointerdown', onMouseEvent, { capture: true });
    window.addEventListener('mousedown', onMouseEvent, { capture: true });
    window.addEventListener('mouseup', onMouseEvent, { capture: true });
    window.addEventListener('auxclick', onAuxClick, { capture: true });
    document.addEventListener('pointerdown', onMouseEvent, { capture: true });
    document.addEventListener('mousedown', onMouseEvent, { capture: true });
    document.addEventListener('mouseup', onMouseEvent, { capture: true });
    document.addEventListener('auxclick', onAuxClick, { capture: true });
    listenersAttached = true;
  };

  const detachWindowListeners = () => {
    if (typeof window === 'undefined' || !listenersAttached) return;
    window.removeEventListener('pointerdown', onMouseEvent, { capture: true });
    window.removeEventListener('mousedown', onMouseEvent, { capture: true });
    window.removeEventListener('mouseup', onMouseEvent, { capture: true });
    window.removeEventListener('auxclick', onAuxClick, { capture: true });
    document.removeEventListener('pointerdown', onMouseEvent, { capture: true });
    document.removeEventListener('mousedown', onMouseEvent, { capture: true });
    document.removeEventListener('mouseup', onMouseEvent, { capture: true });
    document.removeEventListener('auxclick', onAuxClick, { capture: true });
    listenersAttached = false;
  };

  const shouldAttach = options.attachListeners ?? true;
  if (shouldAttach) {
    if (getCurrentInstance()) {
      onMounted(() => attachWindowListeners());
      onBeforeUnmount(() => detachWindowListeners());
    } else {
      attachWindowListeners();
    }
  }

  return {
    history,
    currentIndex,
    currentEntry,
    showSettings,
    settingsView,
    showProjectPicker,
    canGoBack,
    canGoForward,
    navigateTo,
    openHud,
    openProjects,
    openSettings,
    setSettingsView,
    goBack,
    goForward,
    handleTopbarBack,
    handleMouseNavigation,
    attachWindowListeners,
    detachWindowListeners,
  };
}
