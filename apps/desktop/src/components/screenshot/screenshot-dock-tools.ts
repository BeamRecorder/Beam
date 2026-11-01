import { Group, Paintbrush, Ungroup } from '@lucide/vue';
import { editorInsertItems } from '../editor/search/editor-insert-items';
import type { ScreenshotToolbarProps } from './screenshot-toolbar-types';
import type { ScreenshotDockTool } from './screenshot-dock-types';
import { isDockTool } from './screenshot-dock-model';

export function screenshotDockTools(props: ScreenshotToolbarProps, t: (key: string) => string): ScreenshotDockTool[] {
  const tools: ScreenshotDockTool[] = [];
  for (const item of editorInsertItems('screenshot', t))
    if (isDockTool(item.id)) tools.push({ ...item, id: item.id, disabled: props.disabled || props.cropping });
  return [
    ...tools,
    { id: 'canvas', label: t('ScreenshotEditor.canvas'), icon: Paintbrush, disabled: props.disabled || props.cropping },
    {
      id: 'group',
      label: t('ScreenshotEditor.group'),
      icon: Group,
      disabled: props.disabled || props.cropping || !props.canGroup,
      hint: props.canGroup
        ? `${t('ScreenshotEditor.group')} · Ctrl+G`
        : t(`LayerEffects.${props.disabled ? 'busy' : (props.groupDisabledReason ?? 'selectTwoToGroup')}`),
    },
    {
      id: 'ungroup',
      label: t('ScreenshotEditor.ungroup'),
      icon: Ungroup,
      disabled: props.disabled || props.cropping || !props.canUngroup,
      hint: props.canUngroup
        ? `${t('ScreenshotEditor.ungroup')} · Ctrl+Shift+G`
        : t(`LayerEffects.${props.disabled ? 'busy' : (props.ungroupDisabledReason ?? 'selectGroupToUngroup')}`),
    },
  ];
}
