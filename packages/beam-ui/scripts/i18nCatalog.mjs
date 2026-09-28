/** Imports legacy Vue messages without changing the editor's source catalogues. */
export function flattenMessages(source, namespaces) {
  const result = {}
  function visit(value, path) {
    if (typeof value === 'string') {
      const id = path.join('-')
      if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(id)) throw new Error(`Invalid message ID: ${id}`)
      if (Object.hasOwn(result, id)) throw new Error(`Duplicate message ID: ${id}`)
      if (value.includes('|')) throw new Error(`Convert Vue plural rules to Fluent: ${id}`)
      result[id] = value.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}|[{}]/g, (match, name) =>
        name ? `{ $${name} }` : `{ "${match}" }`)
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [key, child] of Object.entries(value)) visit(child, [...path, key])
    } else throw new Error(`Message must be a string or group: ${path.join('.')}`)
  }
  for (const namespace of namespaces) {
    if (!Object.hasOwn(source, namespace)) throw new Error(`Missing namespace: ${namespace}`)
    visit(source[namespace], [namespace])
  }
  return result
}
