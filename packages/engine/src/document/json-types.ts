export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export interface JsonLimits {
  maxNodes: number;
  maxDepth: number;
}
