import { AudioLines, Shapes } from '@lucide/vue';
import type { PopoverMenuItem } from '~/ui/popover/popover-menu-types';
const kindOf = (item: PopoverMenuItem) => item.id.replace(/^insert:/, '');
export function editorInsertMenu(items: readonly PopoverMenuItem[], t: (key: string) => string): PopoverMenuItem[] {
  const video = items.filter((item) => kindOf(item) === 'video');
  const cursor = items.filter((item) => kindOf(item) === 'cursor');
  const elements = items.filter((item) => !['video', 'cursor', 'sound', 'voiceover'].includes(kindOf(item)));
  const audio = items.filter((item) => ['sound', 'voiceover'].includes(kindOf(item)));
  const group = (id: string, label: string, icon: typeof Shapes, children: PopoverMenuItem[]): PopoverMenuItem[] =>
    children.length
      ? [
          {
            id,
            label,
            icon,
            children,
            disabled: children.every((item) => item.disabled),
          },
        ]
      : [];
  return [
    ...video,
    ...group('insert-elements', t('Elements.title'), Shapes, elements),
    ...group('insert-audio', t('SidebarPanel.audio'), AudioLines, audio),
    ...cursor,
  ];
}
