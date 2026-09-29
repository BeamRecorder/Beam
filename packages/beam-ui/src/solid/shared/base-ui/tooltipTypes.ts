import type { TooltipProps as NativeTooltipProps } from '@argui/widgets/solid';
import type { JSX } from '@argui/solid/jsx-runtime';

export type TooltipProps = Pick<NativeTooltipProps,
  'children' | 'content' | 'placement' | 'width' | 'height' | 'grow' | 'shrink' | 'minWidth' | 'maxWidth'> & {
  id?: string;
  delayMs?: number;
  mouseCursor?: JSX.IntrinsicElements['touchArea']['mouseCursor'];
  contentMaxWidth?: number;
  enabled?: boolean;
  /** Native hover region is available only while this container is narrow. */
  onlyBelow?: { scope: string; width: number };
};
