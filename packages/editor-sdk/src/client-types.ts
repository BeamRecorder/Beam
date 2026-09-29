import type { RequestOptions } from './transport-types.ts';
export interface CommitOptions extends RequestOptions { idempotencyKey?: string; dryRun?: boolean }
export interface PollOptions extends RequestOptions { intervalMs?: number }
