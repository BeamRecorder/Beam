import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { MESSAGE_BUDGET_BYTES } from './generated/contracts.ts';
import type { Request, Response } from './generated/contracts.ts';
import type { EditorTransport, RequestOptions } from './transport-types.ts';
import type { McpOptions, RpcPending, RpcResult } from './mcp-types.ts';
import { assertContract } from './validation.ts';

function object(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }

/** Calls generated Beam tools over a real newline-delimited MCP subprocess. */
export class McpConnection implements EditorTransport {
  private pending = new Map<string, RpcPending>();
  private buffered = Buffer.alloc(0);
  private stopped: Error | undefined;
  private readonly modern: boolean;
  private constructor(private child: ChildProcessWithoutNullStreams, private options: McpOptions) {
    this.modern = options.protocolVersion !== '2025-11-25';
    child.stdout.on('data', (chunk: Buffer) => this.receive(chunk));
    child.on('error', (error) => this.fail(error));
    child.on('exit', () => this.fail(new Error('MCP server exited')));
    child.stdin.on('error', (error) => this.fail(error));
    // Keep logs outside responses, bounded by the host's own log policy.
    child.stderr.resume();
  }
  static async connect(options: McpOptions): Promise<McpConnection> {
    const child = spawn(options.binary, options.args ?? [], { stdio: 'pipe' });
    const connection = new McpConnection(child, options);
    try {
      if (connection.modern) {
        const result = await connection.rpc('server/discover', {});
        if (!object(result) || !Array.isArray(result.supportedVersions) || !result.supportedVersions.includes('2026-07-28')) throw new Error('MCP server does not support 2026-07-28');
      } else {
        const result = await connection.rpc('initialize', { protocolVersion: '2025-11-25', clientInfo: { name: 'beam-editor-sdk', version: '0.1.0' }, capabilities: {} });
        if (!object(result) || result.protocolVersion !== '2025-11-25') throw new Error('MCP initialize version mismatch');
        connection.notify('notifications/initialized', {});
      }
      return connection;
    } catch (error) { connection.close(); throw error; }
  }
  async request(request: Request, options?: RequestOptions): Promise<Response> {
    assertContract('Request', request);
    if (request.method === 'artifactRead') {
      const result = await this.rpc('resources/read', { uri: `beam://artifacts/${request.id}?offset=${request.offset}&length=${request.length}` }, options);
      const contents = object(result) && Array.isArray(result.contents) ? result.contents : [];
      const content: unknown = contents[0];
      if (!object(content) || typeof content.text !== 'string') throw new Error('MCP artifact resource omitted its JSON content');
      const response: unknown = JSON.parse(content.text); assertContract('Response', response);
      return response as Response;
    }
    const { method, ...arguments_ } = request;
    const name = `beam_${method.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}`;
    const result = await this.rpc('tools/call', { name, arguments: arguments_ }, options);
    if (!object(result) || !('structuredContent' in result)) throw new Error('MCP tool omitted structuredContent');
    assertContract('Response', result.structuredContent);
    return result.structuredContent as Response;
  }
  private rpc(method: string, parameters: Record<string, unknown>, options: RequestOptions = {}): Promise<unknown> {
    if (this.stopped) return Promise.reject(this.stopped);
    if (options.signal?.aborted) return Promise.reject(new Error('Request cancelled'));
    if (this.pending.size >= 128) return Promise.reject(new Error('MCP request queue budget reached'));
    const timeoutMs = options.timeoutMs ?? this.options.timeoutMs ?? 120_000;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return Promise.reject(new Error('Timeout must be positive and finite'));
    const id = randomUUID();
    const params = this.modern ? { ...parameters, _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': {}, 'io.modelcontextprotocol/clientInfo': { name: 'beam-editor-sdk', version: '0.1.0' } } } : parameters;
    const bytes = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    if (bytes.length > MESSAGE_BUDGET_BYTES) return Promise.reject(new Error('MCP message budget exceeded'));
    return new Promise((resolve, reject) => {
      const finish = (reason: Error) => { this.pending.get(id)?.cleanup(); this.pending.delete(id); this.notify('notifications/cancelled', { requestId: id }); reject(reason); };
      const abort = () => finish(new Error('Request cancelled'));
      const timer = setTimeout(() => finish(new Error('MCP request timed out')), timeoutMs);
      options.signal?.addEventListener('abort', abort, { once: true });
      this.pending.set(id, { resolve, reject, cleanup: () => { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); } });
      this.child.stdin.write(bytes, (error) => { if (error) finish(error); });
    });
  }
  private notify(method: string, params: Record<string, unknown>): void {
    if (!this.stopped) this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }
  private receive(chunk: Buffer): void {
    if (this.stopped) return;
    this.buffered = Buffer.concat([this.buffered, chunk]);
    try {
      let newline: number;
      while ((newline = this.buffered.indexOf(10)) >= 0) {
        if (newline >= MESSAGE_BUDGET_BYTES) throw new Error('MCP response budget exceeded');
        const raw: unknown = JSON.parse(this.buffered.subarray(0, newline).toString('utf8'));
        this.buffered = this.buffered.subarray(newline + 1);
        if (!object(raw) || raw.jsonrpc !== '2.0') throw new Error('Invalid MCP response');
        if (!('id' in raw)) continue;
        if (typeof raw.id !== 'string') throw new Error('Invalid MCP response ID');
        const response = raw as unknown as RpcResult;
        const pending = this.pending.get(raw.id);
        if (!pending) continue;
        pending.cleanup(); this.pending.delete(raw.id);
        if (response.error && typeof response.error.message === 'string') pending.reject(new Error(`MCP ${response.error.code}: ${response.error.message}`));
        else if ('result' in response) pending.resolve(response.result);
        else pending.reject(new Error('MCP response lacks a result or error'));
      }
      if (this.buffered.length > MESSAGE_BUDGET_BYTES) throw new Error('MCP response budget exceeded');
    } catch (error) { this.fail(error instanceof Error ? error : new Error('Invalid MCP response')); }
  }
  private fail(error: Error): void {
    if (this.stopped) return;
    this.stopped = error;
    for (const request of this.pending.values()) { request.cleanup(); request.reject(error); }
    this.pending.clear(); this.buffered = Buffer.alloc(0);
    this.child.stdin.end(); this.child.kill();
  }
  close(): void { this.fail(new Error('MCP connection disposed')); }
}
