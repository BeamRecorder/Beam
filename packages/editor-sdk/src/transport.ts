import { createConnection } from 'node:net';
import { randomUUID } from 'node:crypto';
import { API_VERSION, MESSAGE_BUDGET_BYTES } from './generated/contracts.ts';
import type { Request, Response } from './generated/contracts.ts';
import type { ConnectionOptions, EditorTransport, PendingRequest, RequestOptions } from './transport-types.ts';
import { assertContract, decodeEnvelope } from './validation.ts';

const MESSAGE_BUDGET = MESSAGE_BUDGET_BYTES;
const PENDING_BUDGET = 128;

/** Every call opens one local stream, matching Rust's broker client on every OS. */
export class EditorConnection implements EditorTransport {
  private pending = new Map<string, PendingRequest>();
  private stopped: Error | undefined;
  private constructor(private options: ConnectionOptions) {}

  static async connect(options: ConnectionOptions): Promise<EditorConnection> {
    if (!options.endpoint || !options.token) throw new Error('Endpoint and session token are required');
    return new EditorConnection(options);
  }

  request(request: Request, options: RequestOptions = {}): Promise<Response> {
    try { assertContract('Request', request); }
    catch (error) { return Promise.reject(error); }
    if (this.stopped) return Promise.reject(this.stopped);
    if (options.signal?.aborted) return Promise.reject(new Error('Request cancelled'));
    if (this.pending.size >= PENDING_BUDGET) return Promise.reject(new Error('Editor request queue budget reached'));
    const timeoutMs = options.timeoutMs ?? this.options.timeoutMs ?? 120_000;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return Promise.reject(new Error('Timeout must be positive and finite'));
    const requestId = randomUUID();
    const bytes = Buffer.from(JSON.stringify({ apiVersion: API_VERSION, requestId, token: this.options.token, request }) + '\n');
    if (bytes.byteLength > MESSAGE_BUDGET) return Promise.reject(new Error('Editor message budget exceeded'));
    return new Promise<Response>((resolve, reject) => {
      const socket = createConnection(this.options.endpoint);
      let buffered = Buffer.alloc(0);
      let complete = false;
      const cleanup = () => {
        clearTimeout(timer); options.signal?.removeEventListener('abort', abort);
        this.pending.delete(requestId); socket.destroy();
      };
      const fail = (error: Error) => { if (complete) return; complete = true; cleanup(); reject(error); };
      const abort = () => fail(new Error('Request cancelled'));
      const timer = setTimeout(() => fail(new Error('Editor request timed out')), timeoutMs);
      options.signal?.addEventListener('abort', abort, { once: true });
      this.pending.set(requestId, { resolve, reject: fail, cleanup });
      socket.once('connect', () => socket.write(bytes, (error) => { if (error) fail(error); }));
      socket.on('error', fail);
      socket.once('close', () => fail(new Error('Editor broker connection closed')));
      socket.on('data', (chunk: Buffer) => {
        if (complete) return;
        buffered = Buffer.concat([buffered, chunk]);
        try {
          if (buffered.byteLength > MESSAGE_BUDGET) throw new Error('Editor response budget exceeded');
          const newline = buffered.indexOf(10);
          if (newline < 0) return;
          const envelope = decodeEnvelope(JSON.parse(buffered.subarray(0, newline).toString('utf8')));
          if (envelope.apiVersion !== API_VERSION) throw new Error('Unsupported editor API version');
          if (envelope.requestId !== requestId) throw new Error('Editor response identity mismatch');
          complete = true; cleanup(); resolve(envelope.response);
        } catch (error) { fail(error instanceof Error ? error : new Error('Invalid editor response')); }
      });
    });
  }

  close(): void {
    if (this.stopped) return;
    this.stopped = new Error('Editor connection disposed');
    for (const pending of this.pending.values()) pending.reject(this.stopped);
    this.pending.clear();
  }
}
