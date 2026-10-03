export interface NativeClientOptions {
  executable(): string;
  workingDirectory(): string;
  inputHelperPath?(): string | null;
}
export declare class NativeCaptureClient {
  constructor(options: NativeClientOptions);
  readonly isPoisoned: boolean;
  canCleanup(): boolean;
  request<T = unknown>(
    command: string,
    payload?: object,
    options?: { timeoutMs?: number; allowDuringShutdown?: boolean },
  ): Promise<T>;
  shutdown(): Promise<void>;
  forceShutdown(): Promise<unknown>;
}
export declare const TERMINATE_DEADLINE_MS: number;
