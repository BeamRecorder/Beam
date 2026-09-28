export type UpdatePhase = 'idle' | 'checking' | 'upToDate' | 'available' | 'downloading' | 'verifying' | 'ready' | 'installing' | 'installed' | 'cancelled' | 'failed'

export interface UpdateSnapshot {
  phase: UpdatePhase; version: string | null; downloaded: number; total: number | null;
  percent: number | null; error: string | null; restartRequired: boolean
}
