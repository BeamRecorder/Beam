import { computed, nextTick, provide, ref, shallowRef } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Plus,
  Layers,
  Film,
  Monitor,
  MousePointer,
  Settings,
  SlidersHorizontal,
  Type,
  Volume2,
  ZoomIn,
} from '@lucide/vue';
import { editorInsertItems } from './editor-insert-items';
import { EDITOR_PROPERTY_GROUPS } from './editor-property-catalog';
import { focusEditorProperty } from './focus-editor-property';
import {
  editorSearchKey,
  type EditorSearchAction,
  type EditorSearchContext,
  type EditorSearchOptions,
} from './editor-search-types';

export function provideEditorSearch(options: EditorSearchOptions) {
  const { t, te } = useI18n();
  const providers = shallowRef<(() => EditorSearchAction[])[]>([]);
  let navigator: ((tab: string) => void) | null = null;
  const sections = [
    { tab: 'canvas', key: 'canvas', icon: Monitor },
    { tab: 'clip', key: 'clip', icon: Film },
    { tab: 'zoom', key: 'zoom', icon: ZoomIn },
    { tab: 'cursor', key: 'cursor', icon: MousePointer },
    { tab: 'caption', key: 'captions', icon: Type },
    { tab: 'audio', key: 'audio', icon: Volume2 },
    { tab: 'settings', key: 'settings', icon: Settings },
  ];
  const navigate = async (tab: string) => {
    if (!navigator) throw new Error(t('EditorSearch.unavailable'));
    navigator(tab);
    await nextTick();
  };
  const context: EditorSearchContext = {
    open: ref(false),
    ready: ref(false),
    setVisibleActions: (ids) => options.visible?.(context.open.value ? ids : []),
    registerActions: (provider) => {
      providers.value = [...providers.value, provider];
      return () => {
        providers.value = providers.value.filter((item) => item !== provider);
      };
    },
    items: computed(() => {
      const categories = [
        {
          id: 'insert',
          label: t('EditorSearch.insert'),
          icon: Plus,
          terms: ['add', 'insert'],
        },
        {
          id: 'selection',
          label: t('EditorSearch.clips'),
          icon: Layers,
          terms: ['clips', 'layers'],
        },
        {
          id: 'navigation',
          label: t('EditorSearch.navigation'),
          icon: Monitor,
          terms: ['sections', 'navigate'],
        },
        {
          id: 'setting',
          label: t('EditorSearch.setting'),
          icon: SlidersHorizontal,
          terms: ['settings', 'properties'],
        },
        {
          id: 'action',
          label: t('EditorSearch.action'),
          icon: Film,
          terms: ['actions', 'undo', 'redo'],
        },
      ];
      return categories.map((category) => ({
        ...category,
        id: `category:${category.id}`,
        children: context.actions.value.filter((action) => action.group === category.id),
      }));
    }),
    navigate,
    setNavigator: (callback) => {
      navigator = callback;
      context.ready.value = true;
      return () => {
        if (navigator === callback) {
          navigator = null;
          context.ready.value = false;
        }
      };
    },
    actions: computed(() => {
      const items: EditorSearchAction[] = sections
        .filter((section) => options.mode === 'video' || ['canvas', 'clip', 'settings'].includes(section.tab))
        .map((section) => ({
          id: `navigate:${section.tab}`,
          group: 'navigation',
          label: t(`SidebarPanel.${section.key}`),
          icon: section.icon,
          terms: [section.tab],
          run: () => navigate(section.tab),
        }));
      for (const item of editorInsertItems(options.mode, t)) {
        if (item.id === 'voiceover') continue;
        items.push({
          id: `insert:${item.id}`,
          group: 'insert',
          label: item.label,
          icon: item.icon,
          disabled: !options.canInsert(),
          terms: [item.id],
          run: async () => {
            await navigate('clip');
            await options.insert(item.id);
          },
        });
      }
      for (const group of EDITOR_PROPERTY_GROUPS) {
        if (group.kinds && !group.kinds.includes(options.clipKind() ?? '')) continue;
        if (group.videoOnly && options.mode !== 'video') continue;
        for (const key of group.keys) {
          const path = `${group.namespace}.${key}`;
          if (!te(path)) continue;
          const label = t(path);
          const section = sections.find((value) => value.tab === group.tab)!;
          items.push({
            id: `setting:${path}`,
            group: 'setting',
            label,
            icon: SlidersHorizontal,
            detail: t(`SidebarPanel.${section.key}`),
            terms: [key, group.namespace],
            disabled:
              Boolean(group.clipOnly && !options.canEditClip()) || (group.tab === 'zoom' && !options.canEditZoom?.()),
            run: async () => {
              await navigate(group.tab);
              if (!(await focusEditorProperty(label))) throw new Error(t('EditorSearch.unavailable'));
            },
          });
        }
      }
      return [
        ...items,
        ...providers.value
          .flatMap((provider) => provider())
          .map((action) => ({
            ...action,
            disabled: action.disabled || (action.group === 'insert' && !options.canInsert()),
          })),
        ...options.selections().map((action) => ({
          ...action,
          run: async () => {
            await navigate(action.tab ?? (action.id.startsWith('zoom:') ? 'zoom' : 'clip'));
            await action.run();
          },
        })),
      ];
    }),
  };
  provide(editorSearchKey, context);
  return context;
}
