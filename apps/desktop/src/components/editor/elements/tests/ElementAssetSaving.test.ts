import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { computed, defineComponent, h, nextTick, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { shape } from '@beam/runtime/composition/shape/tests/gpu-shape.fixtures';
import { COMPOSITION_SCHEMA_VERSION } from '@beam/engine/shared/composition-types';
import type { Clip, ShapeClip } from '@beam/engine/shared/composition-types';
import type { ElementAssetSaving } from '../element-asset-saving-types';
import { provideElementEditor } from '../useElementEditor';
import { useElementAssetSaving } from '../useElementAssetSaving';
import { useElementAssets } from '../useElementAssets';
import ElementAssetSavePrompt from '../ElementAssetSavePrompt.vue';
import ElementAssetSaveDialog from '../ElementAssetSaveDialog.vue';
import ElementAssetCanvasMenu from '../ElementAssetCanvasMenu.vue';
import ElementAssetMenuItem from '../ElementAssetMenuItem.vue';
import TextInputDialog from '~/ui/dialog/TextInputDialog.vue';
import { useToastStore } from '~/ui/toast/toastStore';
import { useTimelineContextMenu } from '../../timeline/composables/useTimelineContextMenu';
import type { TimelineTracksEmits } from '../../timeline/composables/timeline-tracks-types';

const api = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }));
vi.mock('~/api/capture', () => ({
  capture: { getPreferences: api.get, updatePreferences: api.update, onPreferencesChanged: () => () => {} },
}));
enableAutoUnmount(afterEach);
beforeEach(() => {
  setActivePinia(createPinia());
  api.get.mockReset().mockResolvedValue({ schemaVersion: 3, shortcuts: {}, extras: {} });
  api.update
    .mockReset()
    .mockImplementation(async (patch) => ({ schemaVersion: 3, shortcuts: {}, extras: patch.extras }));
});
afterEach(() => {
  document.body.innerHTML = '';
});

function create(family: ShapeClip['family'] = 'shape', menuItemOnly = false) {
  const source = shape({ name: 'My bubble', family, preset: 'speech-bubble' });
  const clips = ref<ShapeClip[]>([source]);
  const allowed = ref(true),
    canvas = ref<{ width: number; height: number } | null>({ width: 1920, height: 1080 });
  const remove = vi.fn((id: string) => {
    clips.value = clips.value.filter((clip) => clip.id !== id);
  });
  const hit = vi.fn((): string | null => source.id);
  const menu = ref<InstanceType<typeof ElementAssetCanvasMenu> | null>(null);
  let saving!: ElementAssetSaving,
    editor!: ReturnType<typeof provideElementEditor>,
    timeline!: ReturnType<typeof useTimelineContextMenu>;
  const Child = defineComponent({
    setup() {
      saving = useElementAssetSaving()!;
      timeline = useTimelineContextMenu({
        scopeId: ref('project'),
        currentTimeMs: ref(0),
        composition: computed(() => ({
          schemaVersion: COMPOSITION_SCHEMA_VERSION,
          clips: clips.value,
          assets: [],
          keyboardCaptionSessions: [],
        })),
        zoomElements: ref([]),
        selectedClipId: ref(source.id),
        selectedClipIds: ref([source.id, 'other']),
        selectedZoomId: ref(null),
        selectedZoomIds: ref([]),
        assetFor: () => null,
        emit: vi.fn() as TimelineTracksEmits,
        t: (key) => key,
      });
      return () =>
        menuItemOnly
          ? h(ElementAssetMenuItem, { id: source.id })
          : h('div', [
              h('div', { class: 'canvas-target', onContextmenu: (e: MouseEvent) => menu.value?.open(e) }, [h('input')]),
              h(ElementAssetCanvasMenu, { ref: menu, idAt: hit, disabled: !allowed.value }),
              h(ElementAssetSavePrompt),
            ]);
    },
  });
  const wrapper = mount(
    defineComponent({
      setup() {
        editor = provideElementEditor({
          layers: () => clips.value,
          selectedId: () => source.id,
          canvasSize: () => canvas.value,
          canInteract: () => allowed.value,
          select: vi.fn(),
          insert: vi.fn(),
          update: vi.fn(),
          remove,
          timing: () => ({ startMs: 0, durationMs: 1000 }),
        });
        return () => h(Child);
      },
    }),
    { attachTo: document.body },
  );
  return { wrapper, source, clips, allowed, canvas, hit, saving, editor, timeline, remove };
}
const settle = async () => {
  await flushPromises();
  await flushPromises();
};
const input = () => document.querySelector<HTMLInputElement>('.text-input-dialog input')!;
const submit = async (value: string) => {
  input().value = value;
  input().dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
  document
    .querySelector<HTMLFormElement>('.text-input-dialog')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await settle();
};
const rightClick = async (c: ReturnType<typeof create>) => {
  await c.wrapper.get('.canvas-target').trigger('contextmenu', { button: 2, clientX: 100, clientY: 100 });
  await settle();
};
const menuAction = () =>
  [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((b) =>
    b.textContent?.includes('Add to assets'),
  );

it.each(['shape', 'arrow'] as const)(
  'saves a named %s from its canvas menu, preserving settings without renaming the project element',
  async (family) => {
    const c = create(family);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(api.get).not.toHaveBeenCalled();
    await rightClick(c);
    expect(menuAction()).toBeTruthy();
    menuAction()!.click();
    await settle();
    expect(menuAction()).toBeUndefined();
    expect(input().value).toBe('My bubble');
    expect(document.activeElement).toBe(input());
    expect(api.update).not.toHaveBeenCalled();
    await submit('  Reusable artwork  ');
    expect(useElementAssets().assets[0]).toMatchObject({
      name: 'Reusable artwork',
      style: { family },
      size: { width: c.source.transform.width * 1920, height: c.source.transform.height * 1080 },
    });
    expect(c.clips.value[0]!.name).toBe('My bubble');
    expect(c.saving.draft.value).toBeNull();
  },
);
it('cancels the naming dialog without storing or changing anything', async () => {
  const c = create();
  c.saving.request(c.source);
  await settle();
  const dialog = c.wrapper.getComponent(TextInputDialog);
  dialog.vm.$emit('close');
  await settle();
  expect(c.saving.draft.value).toBeNull();
  expect(api.update).not.toHaveBeenCalled();
  expect(c.clips.value).toEqual([c.source]);
});
it('validates names, trims whitespace and caps the field at 200 characters', async () => {
  const c = create();
  c.saving.request(c.source);
  await settle();
  expect(input().maxLength).toBe(200);
  await submit('   ');
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('required');
  expect(api.update).not.toHaveBeenCalled();
  expect(c.saving.draft.value).not.toBeNull();
});
it('snapshots current text drafts and keeps saved styles independent of later edits', async () => {
  const c = create();
  c.editor.beginText(c.source.id);
  c.editor.updateText('Uncommitted draft');
  c.saving.request(c.source);
  const snapshot = JSON.parse(JSON.stringify(c.saving.draft.value));
  c.editor.updateText('Later draft');
  c.clips.value[0]!.fillColor = '#abcdef';
  expect(c.saving.draft.value).toEqual(snapshot);
  expect(c.saving.draft.value?.clip.text?.content).toBe('Uncommitted draft');
});
it('uses the right-clicked timeline clip in a multiple selection and survives menu closure', async () => {
  const c = create();
  const other = shape({ id: 'other', name: 'Other arrow', family: 'arrow' });
  c.clips.value.push(other);
  c.timeline.openClipContextMenu(new MouseEvent('contextmenu'), other);
  expect(c.timeline.contextMenuItems.value.find((i) => i.id === 'save-asset')).toMatchObject({
    label: 'Add to assets',
    disabled: false,
  });
  c.timeline.handleContextMenuSelect('save-asset');
  await settle();
  expect(c.timeline.contextMenuState.value.isOpen).toBe(false);
  expect(input().value).toBe('Other arrow');
  expect(c.saving.draft.value?.clip.family).toBe('arrow');
});
it('hides asset actions for text, drawings, missing and non-shape clips', async () => {
  for (const family of ['text', 'drawing'] as const) {
    const c = create(family);
    await rightClick(c);
    expect(menuAction()).toBeUndefined();
    c.saving.request(c.source);
    expect(c.saving.draft.value).toBeNull();
    c.wrapper.unmount();
  }
  const c = create();
  expect(c.saving.supports(null)).toBe(false);
  expect(c.saving.supports({ kind: 'video' } as Clip)).toBe(false);
  c.hit.mockReturnValue(null);
  await rightClick(c);
  expect(menuAction()).toBeUndefined();
});
it('blocks unavailable canvases, disabled editors and stale clip identities', async () => {
  const c = create();
  c.canvas.value = null;
  c.saving.request(c.source);
  expect(c.saving.draft.value).toBeNull();
  c.canvas.value = { width: 1920, height: 1080 };
  c.allowed.value = false;
  await nextTick();
  await rightClick(c);
  expect(menuAction()).toBeUndefined();
  c.saving.request(c.source);
  expect(c.saving.draft.value).toBeNull();
  c.allowed.value = true;
  c.clips.value = [];
  c.saving.request(c.source);
  expect(c.saving.draft.value).toBeNull();
});
it('closes a pending dialog when the source project disappears or interaction is disabled', async () => {
  const c = create();
  c.saving.request(c.source);
  c.clips.value = [];
  await nextTick();
  expect(c.saving.draft.value).toBeNull();
  c.clips.value = [c.source];
  c.saving.request(c.source);
  c.allowed.value = false;
  await nextTick();
  expect(c.saving.draft.value).toBeNull();
});
it.each([new Error('disk full'), 'write failed'])(
  'keeps the name and permits retry after a failed preference write (%s)',
  async (failure) => {
    const c = create();
    api.update.mockRejectedValueOnce(failure);
    c.saving.request(c.source);
    await settle();
    await submit('Keep my name');
    expect(input().value).toBe('Keep my name');
    expect(c.saving.draft.value).not.toBeNull();
    expect(useToastStore().toasts.at(-1)?.type).toBe('error');
    await submit('Keep my name');
    expect(useElementAssets().assets[0]?.name).toBe('Keep my name');
    expect(c.saving.draft.value).toBeNull();
  },
);
it('prevents duplicate saves and cancellation while storage is pending', async () => {
  const c = create();
  let resolve!: (value: unknown) => void;
  api.update.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  c.saving.request(c.source);
  await settle();
  await submit('One asset');
  const dialog = c.wrapper.getComponent(TextInputDialog);
  expect(dialog.props('busy')).toBe(true);
  expect(input().disabled).toBe(true);
  dialog.vm.$emit('confirm', 'Duplicate');
  dialog.vm.$emit('close');
  await settle();
  expect(api.update).toHaveBeenCalledTimes(1);
  expect(c.saving.draft.value).not.toBeNull();
  resolve({
    schemaVersion: 3,
    shortcuts: {},
    extras: { elementAssets: api.update.mock.calls[0]![0].extras.elementAssets },
  });
  await settle();
  expect(useElementAssets().assets).toHaveLength(1);
  expect(c.saving.draft.value).toBeNull();
});
it('does not intercept native text editing or an already prevented context menu', async () => {
  const c = create();
  await c.wrapper.get('input').trigger('contextmenu', { button: 2 });
  expect(c.hit).not.toHaveBeenCalled();
  const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  event.preventDefault();
  c.wrapper.get('.canvas-target').element.dispatchEvent(event);
  await settle();
  expect(menuAction()).toBeUndefined();
});
it('does not offer timeline saving when no canvas exists and guards direct menu dispatch', async () => {
  const c = create();
  c.canvas.value = null;
  c.timeline.openClipContextMenu(new MouseEvent('contextmenu'), c.source);
  expect(c.timeline.contextMenuItems.value.find((i) => i.id === 'save-asset')).toMatchObject({ disabled: true });
  c.timeline.handleContextMenuSelect('save-asset');
  expect(c.saving.draft.value).toBeNull();
});
it('renders no save action or dialog outside an element editor', async () => {
  expect(useElementAssetSaving()).toBeNull();
  const wrapper = mount(
    defineComponent({
      setup: () => () => h('div', [h(ElementAssetMenuItem, { id: 'missing' }), h(ElementAssetSaveDialog)]),
    }),
  );
  expect(wrapper.find('[role="menuitem"]').exists()).toBe(false);
  wrapper.getComponent(TextInputDialog).vm.$emit('confirm', 'Ignored');
  await settle();
  expect(api.update).not.toHaveBeenCalled();
});

it('allows an unnamed source to be given a valid asset name', async () => {
  const c = create();
  c.clips.value[0]!.name = '';
  c.saving.request(c.source);
  await settle();
  expect(input().value).toBe('');
  await submit('Named later');
  expect(useElementAssets().assets[0]?.name).toBe('Named later');
  expect(c.clips.value[0]!.name).toBe('');
});
it('reports invalid source geometry at save time without an unhandled menu error', async () => {
  const c = create();
  c.clips.value[0]!.transform.width = 0;
  c.saving.request(c.source);
  await settle();
  await submit('Invalid geometry');
  expect(api.update).not.toHaveBeenCalled();
  expect(useToastStore().toasts.at(-1)?.message).toContain('Invalid element asset');
  expect(c.saving.draft.value).not.toBeNull();
});

it.each(['shape', 'arrow'] as const)(
  'deletes the right-clicked %s after a divider without removing the selected item or saved assets',
  async (family) => {
    const c = create();
    const target = shape({ id: 'clicked', family, name: 'Clicked item' });
    c.clips.value.push(target);
    c.hit.mockReturnValue(target.id);
    await rightClick(c);
    const entries = [...document.querySelectorAll('[role="menu"] > *')];
    expect(entries.map((e) => e.getAttribute('role'))).toEqual(['menuitem', 'separator', 'menuitem']);
    const button = entries.at(-1) as HTMLButtonElement;
    expect(button.textContent).toContain('Delete');
    expect(button.disabled).toBe(false);
    button.click();
    await settle();
    expect(c.remove).toHaveBeenCalledExactlyOnceWith(target.id);
    expect(c.clips.value.map((clip) => clip.id)).toEqual([c.source.id]);
    expect(api.update).not.toHaveBeenCalled();
    expect(document.querySelector('[role="menu"]')).toBeNull();
  },
);
it('disables canvas deletion for a locked target and ignores a stale target', async () => {
  const c = create();
  c.clips.value[0]!.locked = true;
  await rightClick(c);
  const menu = c.wrapper.getComponent(ElementAssetCanvasMenu);
  const action = menu.findAllComponents({ name: 'ContextMenuItem' }).find((item) => item.props('danger'))!;
  expect(action.props('disabled')).toBe(true);
  action.vm.$emit('click');
  expect(c.remove).not.toHaveBeenCalled();
  c.clips.value = [];
  await nextTick();
  action.vm.$emit('click');
  expect(c.remove).not.toHaveBeenCalled();
});
it('blocks an open canvas deletion action if editing becomes disabled', async () => {
  const c = create();
  await rightClick(c);
  c.allowed.value = false;
  await nextTick();
  const action = c.wrapper
    .getComponent(ElementAssetCanvasMenu)
    .findAllComponents({ name: 'ContextMenuItem' })
    .find((item) => item.props('danger'))!;
  expect(action.props('disabled')).toBe(true);
  action.vm.$emit('click');
  expect(c.remove).not.toHaveBeenCalled();
});

it('omits the optional separator for a standalone save action', async () => {
  const c = create('shape', true);
  expect(c.wrapper.find('[role="separator"]').exists()).toBe(false);
  await c.wrapper.get('[role="menuitem"]').trigger('click');
  expect(c.saving.draft.value?.clip.id).toBe(c.source.id);
  expect(api.update).not.toHaveBeenCalled();
});
