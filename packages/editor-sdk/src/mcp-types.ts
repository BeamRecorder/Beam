import type { ChildProcessWithoutNullStreams } from 'node:child_process';
export interface McpOptions { binary: string; args?: string[]; protocolVersion?: '2026-07-28' | '2025-11-25'; timeoutMs?: number }
export interface RpcPending { resolve(value: unknown): void; reject(error: Error): void; cleanup(): void }
export interface RpcResult { jsonrpc: string; id?: string | number; result?: unknown; error?: { code: number; message: string } }
export interface McpProcess { child: ChildProcessWithoutNullStreams }
