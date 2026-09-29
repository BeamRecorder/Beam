// Converts the deliberately bounded JSON Schema vocabulary emitted by Schemars.
const identifier = (name) => /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);

export function typeExpression(schema) {
  if (schema === true) return 'unknown';
  if (schema === false) return 'never';
  if (schema.$ref) {
    const prefix = '#/definitions/';
    if (!schema.$ref.startsWith(prefix)) throw new Error(`Non-local schema reference ${schema.$ref}`);
    return schema.$ref.slice(prefix.length).replaceAll('~1', '/').replaceAll('~0', '~');
  }
  if (schema.enum) return schema.enum.map((value) => JSON.stringify(value)).join(' | ');
  if ('const' in schema) return JSON.stringify(schema.const);
  for (const key of ['oneOf', 'anyOf', 'allOf']) {
    if (schema[key]) return schema[key].map((part) => `(${typeExpression(part)})`).join(key === 'allOf' ? ' & ' : ' | ');
  }
  if (Array.isArray(schema.type)) return schema.type.map((type) => typeExpression({ ...schema, type })).join(' | ');
  switch (schema.type) {
    case 'null': return 'null';
    case 'string': return 'string';
    case 'number':
    case 'integer': return 'number';
    case 'boolean': return 'boolean';
    case 'array':
      if (Array.isArray(schema.items)) return `[${schema.items.map(typeExpression).join(', ')}]`;
      if (Number.isSafeInteger(schema.minItems) && schema.minItems >= 0 && schema.minItems === schema.maxItems) {
        return `[${Array.from({ length: schema.minItems }, () => typeExpression(schema.items ?? true)).join(', ')}]`;
      }
      return `Array<${typeExpression(schema.items ?? true)}>`;
    case 'object': {
      const properties = Object.entries(schema.properties ?? {}).map(([key, value]) => `${identifier(key)}${schema.required?.includes(key) ? '' : '?'}: ${typeExpression(value)}`);
      if (!properties.length) {
        if (schema.additionalProperties === false) return 'Record<string, never>';
        return `Record<string, ${typeExpression(schema.additionalProperties ?? true)}>`;
      }
      if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        return `{ ${properties.join('; ')} } & Record<string, ${typeExpression(schema.additionalProperties)}>`;
      }
      return `{ ${properties.join('; ')} }`;
    }
    case undefined: return 'unknown';
    default: throw new Error(`Unsupported JSON Schema type ${schema.type}`);
  }
}

export function emitTypes(schema) {
  if (!schema.definitions) throw new Error('Missing Rust schema definitions');
  const header = '// Generated from beam-editor-domain::protocol. Run scripts/editor/generate-contracts.mjs.\n';
  const metadata = schema['x-beam'];
  const constants = metadata ? `export const API_VERSION = ${metadata.apiVersion} as const;\nexport const DOCUMENT_VERSION = ${metadata.documentVersion} as const;\nexport const MESSAGE_BUDGET_BYTES = ${metadata.messageBudgetBytes} as const;\nexport const PAGE_LIMIT = ${metadata.pageLimit} as const;\n` : '';
  return header + constants + Object.entries(schema.definitions).sort(([a], [b]) => a.localeCompare(b))
    .map(([name, definition]) => `export type ${name} = ${typeExpression(definition)};`).join('\n') + '\n';
}
