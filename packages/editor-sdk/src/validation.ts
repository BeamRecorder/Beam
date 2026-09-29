import contracts from './generated/schema.json' with { type: 'json' };
import type { ResponseEnvelope } from './generated/contracts.ts';
import { MESSAGE_BUDGET_BYTES } from './generated/contracts.ts';
import type { Schema } from './validation-types.ts';

const definitions = contracts.definitions as unknown as Record<string, Schema>;
const owns = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);

export class ContractError extends Error {
  constructor(path: string, reason: string) { super(`${path}: ${reason}`); this.name = 'ContractError'; }
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function candidates(choices: Schema[], value: unknown): Schema[] {
  if (!object(value)) return choices;
  for (const [key, field] of Object.entries(choices[0]?.properties ?? {})) {
    if (field.enum?.length !== 1 || !choices.every((choice) => choice.properties?.[key]?.enum?.length === 1)) continue;
    // A schema-defined discriminator selects candidates; every selected branch is still validated.
    return choices.filter((choice) => choice.properties![key]!.enum![0] === value[key]);
  }
  return choices;
}

function inspect(schema: Schema | boolean, value: unknown, path: string, budget: { steps: number }, depth: number): void {
  if (++budget.steps > MESSAGE_BUDGET_BYTES || depth > 128) throw new ContractError(path, 'validation budget exceeded');
  if (schema === true) return;
  if (schema === false) throw new ContractError(path, 'value is forbidden');
  if (schema.$ref) {
    const name = schema.$ref.replace(/^#\/definitions\//, '');
    const target = definitions[name];
    if (!target || schema.$ref !== `#/definitions/${name}`) throw new ContractError(path, 'unknown schema reference');
    return inspect(target, value, path, budget, depth + 1);
  }
  for (const [key, exact] of [['anyOf', false], ['oneOf', true]] as const) {
    const choices = schema[key];
    if (choices) {
      let matching = 0;
      for (const choice of candidates(choices, value)) {
        try { inspect(choice, value, path, budget, depth + 1); matching++; }
        catch (error) { if (!(error instanceof ContractError) || error.message.includes('budget exceeded')) throw error; }
      }
      if (!matching || (exact && matching !== 1)) throw new ContractError(path, `expected ${exact ? 'one' : 'a'} matching variant`);
    }
  }
  for (const part of schema.allOf ?? []) inspect(part, value, path, budget, depth + 1);
  if (schema.enum && !schema.enum.some((choice) => JSON.stringify(choice) === JSON.stringify(value))) throw new ContractError(path, 'unknown enum value');
  if (owns(schema, 'const') && value !== schema.const) throw new ContractError(path, 'incorrect discriminator');
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  if (types.length) {
    const valid = types.some((type) => type === 'null' ? value === null : type === 'array' ? Array.isArray(value) : type === 'object' ? object(value) : type === 'integer' ? Number.isSafeInteger(value) : typeof value === type);
    if (!valid) throw new ContractError(path, `expected ${types.join(' or ')}`);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new ContractError(path, 'number must be finite');
    if (schema.minimum !== undefined && value < schema.minimum) throw new ContractError(path, 'below minimum');
    if (schema.maximum !== undefined && value > schema.maximum) throw new ContractError(path, 'above maximum');
  }
  if (typeof value === 'string') {
    if (schema.format === 'uuid' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new ContractError(path, 'invalid UUID');
    if (schema.minLength !== undefined && value.length < schema.minLength) throw new ContractError(path, 'string too short');
    if (schema.maxLength !== undefined && value.length > schema.maxLength) throw new ContractError(path, 'string too long');
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) throw new ContractError(path, 'array too short');
    if (schema.maxItems !== undefined && value.length > schema.maxItems) throw new ContractError(path, 'array too long');
    for (let index = 0; index < value.length; index++) {
      const item = Array.isArray(schema.items) ? schema.items[index] ?? false : schema.items ?? true;
      inspect(item, value[index], `${path}[${index}]`, budget, depth + 1);
    }
  }
  if (object(value)) {
    for (const key of schema.required ?? []) if (!owns(value, key)) throw new ContractError(`${path}.${key}`, 'required property missing');
    for (const [key, property] of Object.entries(value)) {
      const field = schema.properties?.[key];
      if (field) inspect(field, property, `${path}.${key}`, budget, depth + 1);
      else if (schema.additionalProperties === false) throw new ContractError(`${path}.${key}`, 'unknown property');
      else if (typeof schema.additionalProperties === 'object') inspect(schema.additionalProperties, property, `${path}.${key}`, budget, depth + 1);
    }
  }
}

export function assertContract(name: string, value: unknown): void {
  const schema = definitions[name];
  if (!schema) throw new ContractError(name, 'unknown contract');
  inspect(schema, value, name, { steps: 0 }, 0);
}

export function decodeEnvelope(value: unknown): ResponseEnvelope {
  assertContract('ResponseEnvelope', value);
  return value as ResponseEnvelope;
}
