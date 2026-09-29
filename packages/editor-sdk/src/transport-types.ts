import type { Request, Response } from './generated/contracts.ts';
export interface RequestOptions { signal?: AbortSignal; timeoutMs?: number }
export interface EditorTransport {
  request(request: Request, options?: RequestOptions): Promise<Response>;
  close(): void;
}
export interface ConnectionOptions { endpoint: string; token: string; timeoutMs?: number }
export interface PendingRequest {
  resolve(value: Response): void;
  reject(reason: Error): void;
  cleanup(): void;
}
