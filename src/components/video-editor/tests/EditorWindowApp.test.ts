import { flushPromises, mount } from '@vue/test-utils';
import { onMounted } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setCurrentLocale } from '../../../i18n';
import EditorWindowApp from '../EditorWindowApp.vue';
import EditorProjectLoadingOverlay from '../EditorProjectLoadingOverlay.vue';

const state = vi.hoisted(() => ({
  contextListener: null as ((context: { projectId: string }) => void) | null,
  removeContextListener: vi.fn(),
}));

const capture = vi.hoisted(() => ({
  getEditorContext: vi.fn(),
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
  startRecordingFromEditor: vi.fn(),
  openEditor: vi.fn(),
}));

vi.mock('../../../api/capture', () => ({ capture }));
vi.mock('../../ui/toast/ToastProvider.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../../ui/button/Button.vue', () => ({ default: { template: '<button><slot /></button>' } }));
vi.mock('../VideoEditor.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'MockVideoEditor',
      props: { project: { type: Object, required: true } },
      emits: ['ready', 'back-to-hud', 'open-project', 'start-recording'],
      setup(props: { project: { id: string } }, { emit }) {
        onMounted(() => emit('ready'));
        return () =>
          h('div', { class: 'mock-editor', 'data-project-id': props.project.id }, [
            h('button', { class: 'ready', onClick: () => emit('ready') }),
            h('button', { class: 'open-project', onClick: () => emit('open-project', { id: 'project-2' }) }),
            h('button', { class: 'back', onClick: () => emit('back-to-hud') }),
            h('button', {
              class: 'record',
              onClick: () => emit('start-recording', { screenKind: 'display', recordingBarVisibility: 'always' }),
            }),
          ]);
      },
    }),
  };
});

const project = { id: 'project-1', name: 'Project', previewSrc: 'project.mp4' };
const wrappers: Array<ReturnType<typeof mount>> = [];

const mountEditor = () => {
  const wrapper = mount(EditorWindowApp);
  wrappers.push(wrapper);
  return wrapper;
};

describe('EditorWindowApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.documentElement.classList.remove('dark');
    state.contextListener = null;
    capture.getEditorContext.mockResolvedValue({ projectId: project.id });
    capture.listProjects.mockResolvedValue([project]);
    capture.getProjectEditorData.mockResolvedValue({ composition: {}, zoom: {}, presentation: {} });
    capture.openEditor.mockResolvedValue(true);
  });

  afterEach(() => {
    while (wrappers.length > 0) wrappers.pop()?.unmount();
    document.documentElement.classList.remove('dark');
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('loads the editor context and notifies the native window when ready', async () => {
    const wrapper = mountEditor();
    await flushPromises();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await flushPromises();

    expect(wrapper.find('.mock-editor').exists()).toBe(true);
    expect(capture.getProjectEditorData).toHaveBeenCalledWith(project.id);
    expect(capture.reportEditorLoadingStage.mock.calls.map(([stage]) => stage)).toEqual([
      'loadingProject',
      'loadingTimeline',
      'renderingEditor',
    ]);
    expect(capture.notifyEditorReady).toHaveBeenCalledOnce();
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

  it('translates the animated editor loading message', () => {
    setCurrentLocale('fr');
    const wrapper = mountEditor();

    expect(wrapper.get('.editor-project-loading-overlay').attributes('aria-label')).toBe('Préparation de l’éditeur');
  });

  it('returns to the HUD and forwards recording requests', async () => {
    const wrapper = mountEditor();
    await flushPromises();

    await wrapper.get('.back').trigger('click');
    expect(capture.setCameraOverlayActive).toHaveBeenCalledWith(true);
    expect(capture.showHud).toHaveBeenCalledOnce();

    await wrapper.get('.record').trigger('click');
    expect(capture.startRecordingFromEditor).toHaveBeenCalledWith({
      screenKind: 'display',
      recordingBarVisibility: 'always',
    });
  });

  it('syncs a user-selected dark theme to the native window after the renderer class changes', async () => {
    mountEditor();
    await flushPromises();
    capture.setEditorTitlebarTheme.mockClear();

    document.documentElement.classList.add('dark');
    await flushPromises();

    expect(capture.setEditorTitlebarTheme).toHaveBeenLastCalledWith(true);
  });

  it('shows a recoverable error when the requested project is unavailable', async () => {
    capture.listProjects.mockResolvedValue([]);
    const wrapper = mountEditor();
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain('Project not found');
    await wrapper.get('[role="alert"] button').trigger('click');
    expect(capture.showHud).toHaveBeenCalledOnce();
  });

  it('keeps the current editor under a loading overlay and keys the replacement project', async () => {
    vi.useFakeTimers();
    const nextProject = { id: 'project-2', name: 'Next project', previewSrc: 'next.mp4' };
    let resolveNextData!: (value: unknown) => void;
    capture.listProjects.mockResolvedValue([project, nextProject]);
    capture.getProjectEditorData.mockResolvedValueOnce({ composition: {}, zoom: {}, presentation: {} });
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

    resolveNextData({ composition: {}, zoom: {}, presentation: {} });
    await flushPromises();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.mock-editor[data-project-id="project-2"]').exists()).toBe(true);
    expect(wrapper.find('.mock-editor[data-project-id="project-1"]').exists()).toBe(false);
    expect(wrapper.find('.editor-project-loading-overlay').exists()).toBe(true);
  });
});
