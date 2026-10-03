import type { TimelineClipProps } from './timeline-clip-types';

export interface TimelineTrimHandleProps {
  edge: 'start' | 'end';
  title: string;
  state?: TimelineClipProps['trimState'];
}
