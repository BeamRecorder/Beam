/** Capability injected by a host; domain code never receives ambient filesystem access. */
export interface StoredDocument<T> {
  document: T;
  revision: string;
}
export interface DocumentStorage<T> {
  read(id: string): Promise<StoredDocument<T>>;
  write(id: string, value: T, options?: { expectedRevision?: string }): Promise<{ revision: string }>;
  remove(id: string, options?: { expectedRevision?: string }): Promise<void>;
}

/** Random-access writes support encoded container headers and final atomic publication. */
export interface BinaryOutput {
  write(position: number, data: Uint8Array): Promise<void>;
  finalize(): Promise<{ path: string }>;
  abort(): Promise<void>;
}
