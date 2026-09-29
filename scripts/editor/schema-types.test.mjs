import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emitTypes, typeExpression } from './schema-types.mjs';
test('schema emits exact tuples and closed unions', () => {
  assert.equal(typeExpression({type:'array',items:{type:'number'},minItems:2,maxItems:2}),'[number, number]');
  assert.equal(typeExpression({type:'array',items:[{type:'string'},{type:'boolean'}]}),'[string, boolean]');
  assert.equal(typeExpression({oneOf:[{enum:['a']},{type:'null'}]}),'("a") | (null)');
  assert.equal(typeExpression({allOf:[{type:'number'},{type:'integer'}]}),'(number) & (number)');
  assert.equal(typeExpression({type:['string','null']}),'string | null');
});
test('schema renders required fields, maps and local refs reproducibly', () => {
  assert.equal(typeExpression({type:'object',properties:{id:{$ref:'#/definitions/Id'},'a-b':{type:'number'}},required:['id'],additionalProperties:false}),'{ id: Id; "a-b"?: number }');
  assert.equal(typeExpression({type:'object',additionalProperties:{type:'boolean'}}),'Record<string, boolean>');
  assert.equal(typeExpression({type:'object',additionalProperties:false}),'Record<string, never>');
  assert.equal(typeExpression({type:'object',properties:{id:{type:'number'}},additionalProperties:{type:'number'}}),'{ id?: number } & Record<string, number>');
  const schema={definitions:{Z:{type:'string'},A:{type:'integer'}}};
  assert.equal(emitTypes(schema),emitTypes(schema));
  assert.ok(emitTypes(schema).indexOf('type A')<emitTypes(schema).indexOf('type Z'));
});
test('schema rejects unsupported references and types instead of coercing', () => {
  assert.throws(()=>typeExpression({$ref:'https://example.com/schema'}));
  assert.throws(()=>typeExpression({type:'bad'}));
  assert.throws(()=>emitTypes({}));
  assert.equal(typeExpression(true),'unknown');
  assert.equal(typeExpression(false),'never');
  assert.equal(typeExpression({const:true}),'true');
  assert.equal(typeExpression({type:'array'}),'Array<unknown>');
  assert.equal(typeExpression({}),'unknown');
});
