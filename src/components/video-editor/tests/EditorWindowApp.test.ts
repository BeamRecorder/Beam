import { flushPromises, mount } from '@vue/test-utils';
import { isReactive, onMounted, toRaw } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setCurrentLocale } from '../../../i18n';
import EditorWindowApp from '../EditorWindowApp.vue';
import EditorProjectLoadingOverlay from '../EditorProjectLoadingOverlay.vue';

const state = vi.hoisted(() => ({
  contextListener: null as ((context: { projectId: string; kind?: 'screenshot' }) => void) | null,
  removeContextListener: vi.fn(),
  videoModuleLoads: 0,
  videoModuleLoadObserver: null as (() => void) | null,
  deferVideoReady: false,
  resolveVideoReady: null as (() => void) | null,
  screenshotModuleLoads: 0,
}));

const capture = vi.hoisted(() => ({
  getEditorContext: vi.fn(),
  getProject: vi.fn(),
  getProjectEditorData: vi.fn(),
  listProjects: vi.fn(),
  notifyEditorReady: vi.fn(),
  reportEditorLoadingStage: vi.fn(),
  onEditorContext: vi.fn((listener: (context: { projectId: string }) => void) => {
    state.contextListener = listener;
    return state.removeContextListener;
  }),
  setCameraOverlayActive: vi.fn(),
  setEditorTitlebarTheme: vi.fn(),
  showHud: vi.fn(),
  openEditor: vi.fn(),
  openScreenshot: vi.fn(),
}));

vi.mock('../../../api/capture', () => ({ capture }));
vi.mock('../../ui/toast/ToastProvider.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../../ui/button/Button.vue', () => ({ default: { template: '<button><slot /></button>' } }));
vi.mock('../VideoEditor.vue', async () => {
  state.videoModuleLoads++;
  state.videoModuleLoadObserver?.();
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'MockVideoEditor',
      props: {
        project: { type: Object, required: true },
        editorData: { type: Object, required: true },
      },
      emits: ['ready', 'back-to-hud', 'open-project'],
      setup(props: { project: { id: string }; editorData: object }, { emit }) {
        capture.reportEditorLoadingStage('renderingEditor');
        onMounted(async () => {
          capture.reportEditorLoadingStage('loadingPreview');
          if (state.deferVideoReady) {
            await new Promise<void>((resolve) => {
              state.resolveVideoReady = resolve;
            });
          }
          emit('ready');
        });
        return () =>
          h('div', { class: 'mock-editor', 'data-project-id': props.project.id }, [
            h('button', { class: 'ready', onClick: () => emit('ready') }),
            h('button', { class: 'open-project', onClick: () => emit('open-project', { id: 'project-2' }) }),
            h('button', { class: 'back', onClick: () => emit('back-to-hud') }),
          ]);
      },
    }),
  };
});
vi.mock('../screenshot/ScreenshotEditor.vue', async () => {
  state.screenshotModuleLoads++;
  const { defineComponent, h, onMounted } = await import('vue');
  return {
    default: defineComponent({
      name: 'MockScreenshotEditor',
      props: { id: { type: String, required: true } },
      emits: ['ready', 'back-to-hud', 'open-project'],
      setup(props: { id: string }, { emit }) {
        onMounted(() => emit('ready'));
        return () => h('div', { class: 'mock-screenshot-editor', 'data-screenshot-id': props.id });
      },
    }),
  };
});

const project = { id: 'project-1', name: 'Project', previewSrc: 'project.mp4', mode: 'studio' as const };
const wrappers: Array<ReturnType<typeof mount>> = [];

const mountEditor = () => {
  const wrapper = mount(EditorWindowApp);
  wrappers.push(wrapper);
  return wrapper;
};

describe('EditorWindowApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capture.reportEditorLoadingStage.mockReset();
    document.title = 'Beam Editor';
    document.documentElement.classList.remove('dark');
    state.contextListener = null;
    state.videoModuleLoadObserver = null;
    state.deferVideoReady = false;
    state.resolveVideoReady = null;
    capture.getEditorContext.mockResolvedValue({ projectId: project.id });
    capture.getProject.mockResolvedValue(project);
    capture.listProjects.mockResolvedValue([project]);
    capture.getProjectEditorData.mockResolvedValue({ composition: {}, zoom: {}, presentation: {} });
    capture.openEditor.mockResolvedValue(true);
    capture.openScreenshot.mockResolvedValue(undefined);
  });

  afterEach(() => {
    while (wrappers.length > 0) wrappers.pop()?.unmount();
    document.title = 'Beam Editor';
    document.documentElement.classList.remove('dark');
    vi.unstubAllGlobals();
    vi.useRealTimers();
    state.videoModuleLoadObserver = null;
  });

  it('loads only the screenshot module for a screenshot context, then loads video on a Studio context', async () => {
    const loadEvents: string[] = [];
    const editorData = { composition: {}, zoom: {}, presentation: {} };
    let resolveProject!: (value: typeof project) => void;
    let resolveEditorData!: (value: typeof editorData) => void;
    const projectLoad = new Promise<typeof project>((resolve) => {
      resolveProject = resolve;
    });
    const editorDataLoad = new Promise<typeof editorData>((resolve) => {
      resolveEditorData = resolve;
    });

    capture.reportEditorLoadingStage.mockImplementation((stage: string) => {
      loadEvents.push(`stage:${stage}`);
    });
    capture.getProject.mockImplementation((projectId: string) => {
      expect(projectId).toBe(project.id);
      loadEvents.push('getProject');
      return projectLoad;
    });
    capture.getProjectEditorData.mockImplementation((projectId: string) => {
      expect(projectId).toBe(project.id);
      loadEvents.push('getProjectEditorData');
      return editorDataLoad;
    });
    state.videoModuleLoadObserver = () => loadEvents.push('import:VideoEditor');
    capture.getEditorContext.mockResolvedValue({ projectId: 'image-1', kind: 'screenshot' });
    const wrapper = mountEditor();
    await flushPromises();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await flushPromises();

    expect(wrapper.find('.mock-screenshot-editor[data-screenshot-id="image-1"]').exists()).toBe(true);
    expect(state.screenshotModuleLoads).toBe(1);
    expect(state.videoModuleLoads).toBe(0);
    expect(capture.getProject).not.toHaveBeenCalled();
    expect(capture.getProjectEditorData).not.toHaveBeenCalled();
    expect(capture.notifyEditorReady).toHaveBeenCalledOnce();

    loadEvents.length = 0;
    state.contextListener?.({ projectId: project.id });
    await flushPromises();
    expect(loadEvents).toEqual(['stage:loadingProject', 'getProject']);
    expect(capture.getProjectEditorData).not.toHaveBeenCalled();

    resolveProject(project);
    await flushPromises();
    expect(loadEvents).toEqual(['stage:loadingProject', 'getProject', 'stage:loadingTimeline', 'getProjectEditorData']);

    resolveEditorData(editorData);
    await flushPromises();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await flushPromises();

    expect(loadEvents.slice(0, 6)).toEqual([
      'stage:loadingProject',
      'getProject',
      'stage:loadingTimeline',
      'getProjectEditorData',
      'stage:loadingEditorModule',
      'import:VideoEditor',
    ]);
    expect(loadEvents).toEqual([
      'stage:loadingProject',
      'getProject',
      'stage:loadingTimeline',
      'getProjectEditorData',
      'stage:loadingEditorModule',
      'import:VideoEditor',
      'stage:initializingEditor',
      'stage:renderingEditor',
      'stage:loadingPreview',
    ]);
    expect(wrapper.find('.mock-editor[data-project-id="project-1"]').exists()).toBe(true);
    expect(wrapper.find('.mock-screenshot-editor').exists()).toBe(false);
    expect(state.videoModuleLoads).toBe(1);
    expect(capture.getProject).toHaveBeenCalledWith(project.id);
    expect(capture.getProjectEditorData).toHaveBeenCalledWith(project.id);
  });

  it('loads the editor context and notifies the native window when ready', async () => {
    const wrapper = mountEditor();
    await flushPromises();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await flushPromises();

    expect(wrapper.find('.mock-editor').exists()).toBe(true);
    expect(capture.getProject).toHaveBeenCalledWith(project.id);
    expect(capture.getProjectEditorData).toHaveBeenCalledWith(project.id);
    expect(capture.listProjects).not.toHaveBeenCalled();
    expect(document.title).toBe('Project - Beam Editor');
    expect(capture.reportEditorLoadingStage.mock.calls.map(([stage]) => stage)).toEqual([
      'loadingProject',
      'loadingTimeline',
      'loadingEditorModule',
      'initializingEditor',
      'renderingEditor',
      'loadingPreview',
    ]);
    expect(capture.notifyEditorReady).toHaveBeenCalledOnce();
  });

  it('keeps a long recording cursor-event payload raw when it is handed to the editor', async () => {
    const cursorEvents = Array.from({ length: 20_000 }, (_, index) => ({
      event: 'move',
      sessionNs: index * 5_000_000,
      normalizedX: 0.42,
      normalizedY: 0.58,
      visible: true,
    }));
    const editorData = {
      composition: {},
      zoom: {},
      presentation: {},
      cursor: { events: cursorEvents },
    };
    capture.getProjectEditorData.mockResolvedValueOnce(editorData);

    const wrapper = mountEditor();
    await flushPromises();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await flushPromises();

    const editor = wrapper.findComponent({ name: 'MockVideoEditor' });
    const received = editor.props('editorData') as typeof editorData;
    expect(received).toBe(editorData);
    expect(isReactive(received)).toBe(false);
    expect(received.cursor.events).toBe(cursorEvents);
    expect(received.cursor.events.at(-1)).toBe(cursorEvents.at(-1));
    expect(isReactive(received.cursor.events[0])).toBe(false);
    expect(toRaw(received.cursor.events[0])).toBe(cursorEvents[0]);
  });

  it('notifies native readiness when the hidden window never receives an animation frame', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', vi.fn());

    const wrapper = mountEditor();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(100);
    await flushPromises();

    expect(wrapper.find('.mock-editor').exists()).toBe(true);
    expect(capture.notifyEditorReady).toHaveBeenCalledOnce();
  });

  it('notifies Studio readiness once after the editor DOM commits even when preview readiness is pending', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      }),
    );
    state.deferVideoReady = true;

    mountEditor();
    await flushPromises();
    expect(state.resolveVideoReady).toBeTypeOf('function');
    expect(capture.notifyEditorReady).not.toHaveBeenCalled();

    state.resolveVideoReady!();
    await flushPromises();
    expect(capture.notifyEditorReady).toHaveBeenCalledOnce();

    // Advancing the old 100 ms fallback must not produce another notification.
    await vi.advanceTimersByTimeAsync(100);
    expect(capture.notifyEditorReady).toHaveBeenCalledOnce();
  });

  it('notifies the native window synchronously when Studio reports readiness', async () => {
    state.deferVideoReady = true;
    const wrapper = mountEditor();
    await flushPromises();
    expect(capture.notifyEditorReady).not.toHaveBeenCalled();

    (wrapper.get('.ready').element as HTMLButtonElement).click();
    expect(capture.notifyEditorReady).toHaveBeenCalledOnce();

    state.resolveVideoReady?.();
    await flushPromises();
    expect(capture.notifyEditorReady).toHaveBeenCalledOnce();
  });

  it('translates the animated editor loading message', () => {
    capture.getEditorContext.mockReturnValue(new Promise(() => undefined));
    setCurrentLocale('fr');
    const wrapper = mountEditor();

    expect(wrapper.get('.editor-project-loading-overlay').attributes('aria-label')).toBe('Préparation de l’éditeur');
  });

  it('returns to the HUD when requested by the editor', async () => {
    const wrapper = mountEditor();
    await flushPromises();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await flushPromises();

    await wrapper.get('.back').trigger('click');
    expect(capture.setCameraOverlayActive).toHaveBeenCalledWith(true);
    expect(capture.showHud).toHaveBeenCalledOnce();
  });

  it('syncs a user-selected dark theme to the native window after the renderer class changes', async () => {
    mountEditor();
    await flushPromises();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await flushPromises();
    capture.setEditorTitlebarTheme.mockClear();

    document.documentElement.classList.add('dark');
    await flushPromises();

    expect(capture.setEditorTitlebarTheme).toHaveBeenLastCalledWith(true);
  });

  it('shows a recoverable error when the requested project is unavailable', async () => {
    capture.getProject.mockResolvedValue(null);
    const wrapper = mountEditor();
    await flushPromises();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain('Project not found');
    expect(capture.notifyEditorReady).toHaveBeenCalledOnce();
    expect(document.title).toBe('Beam Editor');
    await wrapper.get('[role="alert"] button').trigger('click');
    expect(capture.showHud).toHaveBeenCalledOnce();
  });

  it('shows a recoverable error and notifies native readiness when editor data loading fails', async () => {
    capture.getProjectEditorData.mockRejectedValueOnce(new Error('Timeline unavailable'));
    const wrapper = mountEditor();
    await flushPromises();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain('Timeline unavailable');
    expect(capture.notifyEditorReady).toHaveBeenCalledOnce();
  });

  it('keeps the current editor under a loading overlay and keys the replacement project', async () => {
    vi.useFakeTimers();
    const nextProject = { id: 'project-2', name: 'Next project', previewSrc: 'next.mp4', mode: 'studio' as const };
    let resolveNextData!: (value: unknown) => void;
    const initialEditorData = { composition: {}, zoom: {}, presentation: {} };
    const replacementCursorEvent = { timestampMs: 91_000, position: { x: 0.2, y: 0.8 } };
    const replacementEditorData = {
      composition: {},
      zoom: {},
      presentation: {},
      cursor: { events: [replacementCursorEvent] },
    };
    capture.getProject.mockImplementation(async (id: string) => (id === nextProject.id ? nextProject : project));
    capture.getProjectEditorData.mockResolvedValueOnce(initialEditorData);
    capture.getProjectEditorData.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveNextData = resolve;
      }),
    );

    const wrapper = mountEditor();
    expect(wrapper.findComponent(EditorProjectLoadingOverlay).props('showTopbarSkeleton')).toBe(true);
    await flushPromises();
    expect(wrapper.find('.mock-editor[data-project-id="project-1"]').exists()).toBe(true);

    capture.openEditor.mockImplementation(async (projectId: string) => {
      state.contextListener?.({ projectId });
      return true;
    });
    await wrapper.get('.open-project').trigger('click');
    await flushPromises();

    expect(wrapper.find('.mock-editor[data-project-id="project-1"]').exists()).toBe(true);
    expect(capture.openEditor).toHaveBeenCalledWith(nextProject.id);
    expect(wrapper.find('.editor-project-loading-overlay').exists()).toBe(true);
    expect(wrapper.findComponent(EditorProjectLoadingOverlay).props('showTopbarSkeleton')).toBe(false);

    resolveNextData(replacementEditorData);
    await flushPromises();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.mock-editor[data-project-id="project-2"]').exists()).toBe(true);
    expect(wrapper.find('.mock-editor[data-project-id="project-1"]').exists()).toBe(false);
    expect(document.title).toBe('Next project - Beam Editor');
    expect(wrapper.find('.editor-project-loading-overlay').exists()).toBe(true);
    const replacementEditor = wrapper.findComponent({ name: 'MockVideoEditor' });
    const receivedReplacement = replacementEditor.props('editorData') as typeof replacementEditorData;
    expect(receivedReplacement).toBe(replacementEditorData);
    expect(receivedReplacement.cursor.events[0]).toBe(replacementCursorEvent);
    expect(isReactive(receivedReplacement.cursor.events[0])).toBe(false);
  });

  it('ignores a stale video load after the context switches to a screenshot', async () => {
    let resolveVideoData!: (value: unknown) => void;
    capture.getProjectEditorData.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveVideoData = resolve;
      }),
    );
    const wrapper = mountEditor();
    await flushPromises();
    expect(capture.getProject).toHaveBeenCalledWith(project.id);

    state.contextListener?.({ projectId: 'image-2', kind: 'screenshot' });
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.mock-screenshot-editor[data-screenshot-id="image-2"]').exists()).toBe(true);

    resolveVideoData({ composition: {}, zoom: {}, presentation: {} });
    await flushPromises();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.mock-editor').exists()).toBe(false);
    expect(wrapper.find('.mock-screenshot-editor[data-screenshot-id="image-2"]').exists()).toBe(true);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });
  it('opens screenshot projects through the screenshot route from the shared picker', async () => {
    const wrapper = mountEditor();
    await flushPromises();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await flushPromises();
    wrapper.findComponent({ name: 'MockVideoEditor' }).vm.$emit('open-project', { id: 'image-1', mode: 'screenshot' });
    await flushPromises();
    expect(capture.openScreenshot).toHaveBeenCalledWith('image-1');
    expect(capture.openEditor).not.toHaveBeenCalled();
  });
});
