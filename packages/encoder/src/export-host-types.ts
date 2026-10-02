/** Platform-owned output; positions allow the muxer to update container headers. */
export interface ExportHostServices {
  createWorker(): Worker;
  writeChunk(chunk: { sequence: number; position: number; data: Uint8Array }): Promise<void>;
  finalize(): Promise<{ path: string }>;
  abort(): Promise<void>;
}
