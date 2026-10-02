import {
  ArrowRight,
  CircleDashed,
  Focus,
  Image,
  Mic2,
  MousePointer2,
  Palette,
  Pencil,
  Shapes,
  Type,
  Video,
  Volume2,
} from '@lucide/vue';
import type { PopoverMenuItem } from '~/ui/popover/popover-menu-types';
import type { EditorInsertKind } from './editor-search-types';

const definitions = [
  { id: 'text', key: 'Elements.text', icon: Type },
  { id: 'shape', key: 'Elements.shape', icon: Shapes },
  { id: 'arrow', key: 'Elements.arrow', icon: ArrowRight },
  { id: 'drawing', key: 'Elements.drawing', icon: Pencil },
  { id: 'image', key: 'Elements.image', icon: Image },
  { id: 'highlight', key: 'Highlight.title', icon: Focus },
  { id: 'blur', key: 'TimelineToolbar.blur', icon: CircleDashed },
  { id: 'color', key: 'CanvasPanel.color', icon: Palette },
  { id: 'video', key: 'TimelineToolbar.video', icon: Video },
  { id: 'sound', key: 'TimelineToolbar.sound', icon: Volume2 },
  { id: 'voiceover', key: 'TimelineToolbar.voiceover', icon: Mic2 },
  { id: 'cursor', key: 'Elements.cursor', icon: MousePointer2 },
] as const;

export function editorInsertItems(
  mode: 'video' | 'screenshot',
  t: (key: string) => string,
): (PopoverMenuItem & { id: EditorInsertKind })[] {
  return definitions
    .filter((item) =>
      mode === 'video' ? item.id !== 'cursor' : !['video', 'sound', 'voiceover', 'color'].includes(item.id),
    )
    .map((item) => ({ id: item.id, label: t(item.key), icon: item.icon }));
}
