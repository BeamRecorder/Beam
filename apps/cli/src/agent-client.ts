import { discoverAgents } from '@beam/native-client/agent-discovery';
import type { AgentInstance } from '@beam/native-client/agent-discovery';
import type { AgentClient } from './agent-types';

export function listAgentInstances() {
  return discoverAgents().map(({ token: _token, ...instance }) => instance);
}
export function selectAgent(instances: AgentInstance[], pid?: number) {
  if (pid !== undefined) {
    const selected = instances.find((instance) => instance.pid === pid);
    if (!selected) throw new Error(`Beam instance ${pid} is unavailable. Use beam instances.`);
    return selected;
  }
  if (instances.length !== 1)
    throw new Error(
      instances.length
        ? 'Multiple Beam instances are open. Use beam instances, then --instance PID.'
        : 'Start Beam first (bun run dev or the installed app), then open a project.',
    );
  return instances[0]!;
}
export function createAgentClient(pid?: number): AgentClient {
  const instance = selectAgent(discoverAgents(), pid);
  return {
    async call<T>(tool: string, arguments_: object): Promise<T> {
      const response = await fetch(`http://127.0.0.1:${instance.port}/rpc`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${instance.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: 1, tool, arguments: arguments_ }),
        signal: AbortSignal.timeout(45000),
      });
      const value = (await response.json()) as { ok?: boolean; result?: T; error?: string };
      if (!response.ok || !value.ok) throw new Error(value.error ?? `Beam agent request failed (${response.status}).`);
      return value.result as T;
    },
  };
}
