import { existsSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, isAbsolute, join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const extensions = new Set(['.svg', '.png', '.jpg', '.jpeg', '.webp'])
const safePath = /^[A-Za-z0-9_./-]+$/

function logicalPath(value, label) {
  if (typeof value !== 'string' || !value || isAbsolute(value) || !safePath.test(value)
    || value.includes('\\') || value.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error(`Unsafe ${label}: ${JSON.stringify(value)}`)
  }
  return value
}

function sourcePath(root, path) {
  const actual = realpathSync(resolve(root, logicalPath(path, 'source path')))
  if (actual !== root && !actual.startsWith(root + sep)) {
    throw new Error(`Asset source escapes root: ${path}`)
  }
  return actual
}

function addAsset(root, key, path, assets) {
  logicalPath(key, 'asset key')
  if (!extensions.has(extname(path).toLowerCase())) throw new Error(`Unsupported asset format: ${path}`)
  const actual = sourcePath(root, path)
  if (!statSync(actual).isFile()) throw new Error(`Asset source is not a file: ${path}`)
  if (assets.has(key)) throw new Error(`Duplicate asset key: ${key}`)
  const kind = extname(path).toLowerCase() === '.svg' ? 'svg' : 'image'
  let hash = 0xcbf29ce484222325n
  for (const byte of new TextEncoder().encode(`${kind}:${key}`)) {
    hash = ((hash ^ BigInt(byte)) * 0x100000001b3n) & 0xffffffffffffffffn
  }
  const id = Number(hash & 0x1fffffffffffffn)
  if (!id) throw new Error(`Zero asset ID: ${key}`)
  assets.set(key, { key, kind, id, path, bytes: statSync(actual).size })
}

function collectPack(root, prefix, folder, assets) {
  for (const entry of readdirSync(sourcePath(root, folder), { withFileTypes: true })) {
    const path = `${folder}/${entry.name}`
    const key = `${prefix}/${entry.name}`
    if (entry.isDirectory()) collectPack(root, key, path, assets)
    else if (entry.isFile() && extensions.has(extname(entry.name).toLowerCase())) {
      addAsset(root, key, path, assets)
    } else if (entry.isSymbolicLink()) {
      throw new Error(`Asset pack contains a symlink: ${path}`)
    }
  }
}

function rustEntries(assets) {
  return assets.map(({ key, kind, id, path }) =>
    `    AssetInput { key: ${JSON.stringify(key)}, kind: AssetKind::${kind === 'svg' ? 'Svg' : 'Image'}, id: ${id}, bytes: include_bytes!("assets/${path}") },`)
}

function tsEntries(assets) {
  return assets.map(({ key, kind, id }) =>
    `  ${JSON.stringify(key)}: { kind: ${JSON.stringify(kind)}, id: ${id} },`)
}

function sourceModule(app, path) {
  const base = resolve(path)
  const candidate = [base, ...['.ts', '.tsx', '.js', '.jsx', '.mjs'].map(extension => base + extension),
    ...['.ts', '.tsx', '.js', '.jsx'].map(extension => join(base, 'index' + extension))]
    .find(file => existsSync(file) && statSync(file).isFile())
  if (!candidate) throw new Error(`Source import not found: ${path}`)
  const actual = realpathSync(candidate)
  if (!actual.startsWith(app + sep)) throw new Error(`Source import escapes app: ${path}`)
  return actual
}

function referencedAssets(app, entries) {
  if (!Array.isArray(entries) || entries.length === 0) throw new Error('entries must name TSX application roots')
  const pending = entries.map(entry => sourceModule(app, join(app, logicalPath(entry, 'entry'))))
  const visited = new Set()
  const keys = new Set()
  while (pending.length) {
    const path = pending.pop()
    if (visited.has(path)) continue
    visited.add(path)
    const text = readFileSync(path, 'utf8')
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true,
      path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const assetNames = new Set()
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue
      const specifier = statement.moduleSpecifier
      if (!specifier || !ts.isStringLiteral(specifier) || !specifier.text.startsWith('.')) continue
      if (/^\.{1,2}\/.*assets\.generated(?:\.[jt]s)?$/.test(specifier.text)) {
        if (ts.isImportDeclaration(statement) && statement.importClause?.namedBindings
          && ts.isNamedImports(statement.importClause.namedBindings)) {
          for (const item of statement.importClause.namedBindings.elements) {
            if ((item.propertyName ?? item.name).text === 'mediaAssets') assetNames.add(item.name.text)
          }
        }
        continue
      }
      pending.push(sourceModule(app, join(dirname(path), specifier.text)))
    }
    function visit(node) {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const target = node.arguments[0]
        if (!target || !ts.isStringLiteral(target)) {
          const location = source.getLineAndCharacterOfPosition(node.getStart(source))
          throw new Error(`${path}:${location.line + 1}: dynamic module import cannot be scanned for release assets; use a literal import path`)
        }
        if (target.text.startsWith('.')) pending.push(sourceModule(app, join(dirname(path), target.text)))
        return
      }
      if (ts.isCallExpression(node) && node.expression.getText(source).startsWith('import.meta.glob')) {
        const location = source.getLineAndCharacterOfPosition(node.getStart(source))
        throw new Error(`${path}:${location.line + 1}: import.meta.glob cannot be scanned for release assets; import modules explicitly`)
      }
      if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression)
        && assetNames.has(node.expression.text)) {
        if (!node.argumentExpression || !ts.isStringLiteral(node.argumentExpression)) {
          const location = source.getLineAndCharacterOfPosition(node.getStart(source))
          throw new Error(`${path}:${location.line + 1}: dynamic mediaAssets access cannot be packaged; use a literal asset key`)
        }
        keys.add(node.argumentExpression.text)
        return
      }
      if (ts.isIdentifier(node) && assetNames.has(node.text)) {
        const location = source.getLineAndCharacterOfPosition(node.getStart(source))
        throw new Error(`${path}:${location.line + 1}: use mediaAssets with a literal key so release assets can be determined`)
      }
      ts.forEachChild(node, visit)
    }
    source.statements.forEach(visit)
  }
  return keys
}

/** Generates app-local asset references and native embeds from a JSON configuration.
 * Packs expose whole directories in development. Production embeds only static `mediaAssets`
 * references reachable from the configured entries. Files point at individual sources under `assets/`.
 */
export function generateAppAssets(configPath) {
  const app = dirname(resolve(configPath))
  const root = realpathSync(join(app, 'assets'))
  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  const assets = new Map()
  for (const [prefix, folder] of Object.entries(config.packs ?? {})) {
    logicalPath(prefix, 'pack name')
    collectPack(root, prefix, logicalPath(folder, 'pack folder'), assets)
  }
  for (const [key, path] of Object.entries(config.files ?? {})) addAsset(root, key, path, assets)
  const ids = new Set()
  const development = [...assets.values()].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  for (const asset of development) {
    if (ids.has(asset.id)) throw new Error(`Asset ID collision: ${asset.key}`)
    ids.add(asset.id)
  }
  const released = referencedAssets(app, config.entries)
  for (const key of released) {
    logicalPath(key, 'referenced asset key')
    if (!assets.has(key)) throw new Error(`Release asset is not available: ${key}`)
  }
  const production = development.filter(asset => released.has(asset.key))
  const manifest = entries => ({
    version: 1,
    totalBytes: entries.reduce((total, asset) => total + asset.bytes, 0),
    assets: entries.map(({ key, kind, id, bytes, path }) => ({ key, kind, id, bytes, path })),
  })
  writeFileSync(join(app, 'assets.generated.json'), JSON.stringify(manifest(production), null, 2) + '\n')
  writeFileSync(join(app, 'assets.dev.generated.json'), JSON.stringify(manifest(development), null, 2) + '\n')
  writeFileSync(join(app, 'assets.generated.rs'), [
    '// Generated by scripts/generate-app-assets.mjs.',
    '#[cfg(debug_assertions)]',
    "pub(crate) const EMBEDDED: &[AssetInput<'static>] = &[",
    ...rustEntries(development),
    '];',
    '#[cfg(not(debug_assertions))]',
    "pub(crate) const EMBEDDED: &[AssetInput<'static>] = &[",
    ...rustEntries(production),
    '];',
    '',
  ].join('\n'))
  writeFileSync(join(app, 'assets.generated.ts'), [
    '// Generated by scripts/generate-app-assets.mjs.',
    "import type { AssetRef } from '@argui/host'",
    'declare const __ARGUI_DEV_ASSETS__: boolean',
    'const developmentAssets = {',
    ...tsEntries(development),
    '} as const satisfies Record<string, AssetRef>',
    'const releaseAssets = {',
    ...tsEntries(production),
    '} as const satisfies Record<string, AssetRef>',
    '/** Application-owned references; development can expose the configured packs. */',
    "export const mediaAssets: Record<string, AssetRef> = typeof __ARGUI_DEV_ASSETS__ !== 'undefined' && __ARGUI_DEV_ASSETS__ ? developmentAssets : releaseAssets",
    '',
  ].join('\n'))
  return { development: manifest(development), release: manifest(production) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  generateAppAssets(resolve(process.argv[2] ?? 'assets.config.json'))
}
