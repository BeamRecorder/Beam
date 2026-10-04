export interface AgentInstance {
  version: 1;
  pid: number;
  port: number;
  token: string;
  profile?: string;
}
export function agentDirectory(options?: {
  platform?: string;
  env?: Record<string, string | undefined>;
  home?: string;
}): string;
export function discoverAgents(directory?: string): AgentInstance[];
