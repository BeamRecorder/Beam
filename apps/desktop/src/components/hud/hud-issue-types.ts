export type HudIssueTone = 'error' | 'warning' | 'info' | 'success';

export interface HudIssueModel {
  id: string;
  title: string;
  details: string[];
  tone: HudIssueTone;
  copyText?: string;
  copyLabel?: string;
  copiedLabel?: string;
  actionLabel?: string;
  actionLoading?: boolean;
  actionDisabled?: boolean;
}
