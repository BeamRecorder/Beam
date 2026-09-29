import { expect, it } from 'vitest';
import { assertContract, ContractError, decodeEnvelope } from '../src/validation.ts';
import type { Clip, Instance } from '../src/generated/contracts.ts';
import { MESSAGE_BUDGET_BYTES } from '../src/generated/contracts.ts';
import { randomUUID } from 'node:crypto';

it('checks generated discriminated requests and envelopes', () => {
  assertContract('Request', { method: 'seek', positionMs: 50 });
  assertContract('Binding', { kind: 'constant', value: { kind: 'color', value: [1, 0, 0, 1] } });
  expect(decodeEnvelope({ apiVersion: 1, requestId: 'x', response: { type: 'acknowledged' } }).requestId).toBe('x');
  expect(() => assertContract('missing', {})).toThrow(ContractError);
});
it('accepts dense paged edits within the transport budget', () => {
  const instances: Instance[] = Array.from({ length: 100 }, () => ({ id: randomUUID(), definitionId: 'beam.color', definitionVersion: 1, enabled: true, range: null, parameters: { brightness: { kind: 'constant', value: { kind: 'number', value: 0.01 } } } }));
  const clip: Clip = { id: randomUUID(), assetId: randomUUID(), trackId: randomUUID(), startMs: 0, sourceInMs: 0, durationMs: 1000, effects: { opacity: 1, volume: 1, brightness: 0, saturation: 1, scale: 1, x: 0.5, y: 0.5, autoZoom: true, fadeInMs: 0, fadeOutMs: 0 }, instances, rate: { numerator: 1, denominator: 1 }, animationOffsetMs: 0, generator: null, linkGroup: null };
  const page = { revision: 1, items: Array.from({ length: 128 }, () => ({ ...clip, id: randomUUID() })), total: 10_000, next: 128 };
  expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThan(MESSAGE_BUDGET_BYTES);
  assertContract('Page_for_Clip', page);
  expect(() => assertContract('Binding', { kind: 'unknown', value: 1 })).toThrow();
});
it('rejects malformed numbers, unknown properties and UUIDs before sending', () => {
  for (const value of [
    { method: 'seek', positionMs: -1 }, { method: 'seek', positionMs: Infinity },
    { method: 'seek', positionMs: 0.5 }, { method: 'seek', positionMs: Number.MAX_SAFE_INTEGER + 1 },
    { method: 'import', paths: ['/etc/passwd'] }, { method: 'seek' }, null, [],
    { method: 'query', query: { kind: 'clips', sequenceId: 'bad', offset: 0, limit: 1 } },
  ]) expect(() => assertContract('Request', value)).toThrow(ContractError);
  expect(() => decodeEnvelope({ apiVersion: 1, requestId: 'x', response: { type: 'acknowledged', secret: 1 } })).toThrow();
});
it('checks nested tuple size, required fields, choices and nullable pages', () => {
  for (const value of [
    { kind: 'color', value: [1, 0, 0] }, { kind: 'color', value: [1, 0, 0, 1, 1] },
    { kind: 'number', value: NaN }, { kind: 'boolean', value: 1 }, { kind: 'choice', value: {} },
  ]) expect(() => assertContract('Value', value)).toThrow();
  assertContract('Page_for_Clip', { revision: 0, items: [], next: null, total: 0 });
  assertContract('Page_for_Clip', { revision: 0, items: [], next: 2, total: 0 });
  assertContract('Response', { type: 'schema', schema: { examples: [null, true, 1] } });
});
it('validates discriminated region scopes without requiring a synthetic clip ID',()=>{
  const sequenceId=randomUUID();const id=randomUUID();const time={ticks:0,timescale:1000};
  for(const target of [{kind:'clip',sequenceId,clipId:id},{kind:'track',sequenceId,trackId:id},{kind:'sequence',sequenceId}]) {
    assertContract('Request',{method:'query',query:{kind:'scopedParameterValues',target,time}});
    assertContract('TimelineRegion',{id,target,definitionId:'beam.opacity',definitionVersion:2,enabled:false,kind:'effect',start:time,end:{ticks:1000,timescale:1000},name:null});
  }
  assertContract('Request',{method:'query',query:{kind:'clipHeaders',sequenceId,offset:0,limit:256}});
  expect(()=>assertContract('ReadTarget',{kind:'track',sequenceId,clipId:id})).toThrow(ContractError);
  expect(()=>assertContract('ReadTarget',{kind:'sequence',sequenceId,path:'/private'})).toThrow(ContractError);
});
