export interface TimelineReorderRow {
  id: string;
  clips: readonly { locked?: boolean }[];
}
