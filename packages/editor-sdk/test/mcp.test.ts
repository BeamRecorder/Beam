import { afterEach, expect, it } from 'vitest';
import { McpConnection } from '../src/mcp.ts';
import type { McpOptions } from '../src/mcp-types.ts';
const connections: McpConnection[] = [];
afterEach(() => { for (const connection of connections.splice(0)) connection.close(); });
function options(mode = 'normal', legacy = false): McpOptions {
  const program = `
    const readline = require('node:readline');
    const mode = ${JSON.stringify(mode)};
    const send = (value) => process.stdout.write(JSON.stringify(value) + '\\n');
    readline.createInterface({input:process.stdin}).on('line',line=>{
      const request=JSON.parse(line); if(!request.id) return;
      let result;
      if(request.method==='server/discover') result={supportedVersions:mode==='unsupported'?[]:['2026-07-28']};
      else if(request.method==='initialize') result={protocolVersion:mode==='version'?'2026-07-28':'2025-11-25'};
      else if(mode==='hang') return;
      else if(mode==='bad') {process.stdout.write('invalid\\n');return;}
      else if(mode==='jsonrpc'){send({jsonrpc:'1',id:request.id,result:{}});return;}
      else if(mode==='id'){send({jsonrpc:'2.0',id:1,result:{}});return;}
      else if(mode==='error'){send({jsonrpc:'2.0',id:request.id,error:{code:-32602,message:'invalid'}});return;}
      else if(mode==='empty'){send({jsonrpc:'2.0',id:request.id});return;}
      else if(mode==='large'){process.stdout.write('x'.repeat(8*1024*1024+1));return;}
      else if(mode==='missing') result={};
      else if(request.method==='resources/read') result={contents:[{text:JSON.stringify({type:'artifactData',data:{artifactId:'00000000-0000-4000-8000-000000000001',offset:0,byteLength:4,dataBase64:'dGVzdA==',next:null}})}]};
      else result={structuredContent:{type:'acknowledged'}};
      send({jsonrpc:'2.0',method:'notifications/message',params:{}});
      send({jsonrpc:'2.0',id:'already-finished',result:{}});
      const reply=JSON.stringify({jsonrpc:'2.0',id:request.id,result})+'\\n';
      process.stdout.write(reply.slice(0,5));setTimeout(()=>process.stdout.write(reply.slice(5)),1);
    });
  `;
  return { binary: process.execPath, args: ['-e', program], protocolVersion: legacy ? '2025-11-25' : '2026-07-28' };
}
async function connect(mode?: string, legacy?: boolean): Promise<McpConnection> { const connection = await McpConnection.connect(options(mode, legacy)); connections.push(connection); return connection; }
it('negotiates both explicit revisions and sends generated tools', async () => {
  for (const legacy of [false, true]) {
    const connection = await connect('normal', legacy);
    expect(await connection.request({ method: 'validateTransaction', transaction: { apiVersion: 1, projectId: '00000000-0000-4000-8000-000000000001', sequenceId: '00000000-0000-4000-8000-000000000001', expectedRevision: 0, idempotencyKey: 'key', commands: [] } })).toEqual({ type: 'acknowledged' });
    connection.close(); connection.close(); await expect(connection.request({ method: 'discovery' })).rejects.toThrow('disposed');
  }
});
it('rejects protocol negotiation failures, process errors and invalid outputs', async () => {
  await expect(connect('unsupported')).rejects.toThrow('does not support');
  await expect(connect('version', true)).rejects.toThrow('version mismatch');
  await expect(McpConnection.connect({ binary: '/missing-mcp' })).rejects.toThrow();
  await expect(McpConnection.connect({ binary: process.execPath, args: ['-e', 'process.exit(1)'] })).rejects.toThrow('exited');
  for (const mode of ['bad', 'jsonrpc', 'id', 'error', 'empty', 'missing', 'large']) {
    const connection = await connect(mode);
    await expect(connection.request({ method: 'discovery' })).rejects.toThrow();
  }
});
it('bounds pending RPCs and supports cancellation and timeout', async () => {
  const connection = await connect('hang');
  await expect(connection.request({ method: 'discovery' }, { timeoutMs: 3 })).rejects.toThrow('timed out');
  await expect(connection.request({ method: 'discovery' }, { signal: AbortSignal.abort() })).rejects.toThrow('cancelled');
  await expect(connection.request({ method: 'discovery' }, { timeoutMs: 0 })).rejects.toThrow('Timeout');
  const controller = new AbortController(); const cancelled = connection.request({ method: 'discovery' }, { signal: controller.signal }); controller.abort(); await expect(cancelled).rejects.toThrow('cancelled');
  await expect(connection.request({ method: 'create', projectGrant: 'g', name: 'x'.repeat(8 * 1024 * 1024) })).rejects.toThrow('message budget');
  const pending = Array.from({ length: 128 }, () => connection.request({ method: 'discovery' }).catch((error: unknown) => error));
  await expect(connection.request({ method: 'discovery' })).rejects.toThrow('queue budget'); connection.close(); await Promise.all(pending);
});
it('reads artifacts through MCP resources and rejects missing resource contents',async()=>{
  const request={method:'artifactRead' as const,id:'00000000-0000-4000-8000-000000000001',offset:0,length:4};
  expect(await (await connect()).request(request)).toMatchObject({type:'artifactData',data:{dataBase64:'dGVzdA=='}});
  await expect((await connect('missing')).request(request)).rejects.toThrow('JSON content');
});
