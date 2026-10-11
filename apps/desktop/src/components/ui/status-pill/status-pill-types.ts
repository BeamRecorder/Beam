import type { BeamyPhase } from '../../brand/Beamy/beamy-types';

export interface StatusPillProps {
  expanded: boolean;
  completed?: boolean;
  failed?: boolean;
  opensBelow?: boolean;
  nativeDraggable?: boolean;
  label: string;
  detail: string;
  percent: number | null;
  preview?: string | null;
  mascot?: boolean;
  mascotPhase?: BeamyPhase;
  jobKey?: string;
}
