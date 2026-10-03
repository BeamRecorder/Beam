import type { ToolDefinition } from './agent-types';

const string = { type: 'string', minLength: 1 };
const projectId = { ...string, description: 'Project UUID from projects.list.' };
const integer = { type: 'integer', minimum: 0 };
const revision = {
  ...integer,
  description: 'Revision returned by documents.snapshot. Conflicts fail without applying edits.',
};
const schema = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
const definition = (
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[] = [],
  live = true,
): ToolDefinition => ({ name, description, inputSchema: schema(properties, required), live });

export const TOOL_CATALOG: ToolDefinition[] = [
  definition('tools.list', 'Discover tools and their JSON input schemas; works without Beam running.', {}, [], false),
  definition(
    'docs.read',
    'Find bundled documentation, GitHub source links and the recommended reading order.',
    { topic: { type: 'string', enum: ['agent', 'html', 'gradients', 'commands', 'architecture'] } },
    [],
    false,
  ),
  definition(
    'instances.list',
    'Find running Beam instances. Select --instance PID when several are open.',
    {},
    [],
    false,
  ),
  definition('fonts.list', 'List imported fonts available for native editable text. No open project is required.', {}),
  definition(
    'fonts.import',
    'Import a local TTF, OTF, WOFF or WOFF2 into Beam. Use the returned family and id as text.style.fontFamily and fontAssetId; native text remains editable and exports with the font.',
    { source: string },
    ['source'],
  ),
  definition('projects.list', 'List saved projects and active authoring documents.', {}),
  definition(
    'projects.create',
    'Create a video project or a transparent screenshot canvas. Open it with projects.open.',
    {
      kind: { type: 'string', enum: ['image', 'video'] },
      name: string,
      width: { type: 'integer', minimum: 2, maximum: 8192 },
      height: { type: 'integer', minimum: 2, maximum: 8192 },
    },
    ['kind'],
  ),
  definition(
    'projects.open',
    'Open an existing project in a new editor window by default, preserving current editors. Use disposition: reuse to replace the active editor. Poll projects.list until it appears in open.',
    {
      projectId,
      kind: { type: 'string', enum: ['image', 'video'] },
      disposition: { type: 'string', enum: ['new-window', 'reuse'], default: 'new-window' },
    },
    ['projectId', 'kind'],
  ),
  definition(
    'documents.snapshot',
    'Read the active document and revision. Screenshot returns StillDocument; video returns CompositionSnapshot.',
    { projectId },
    ['projectId'],
  ),
  definition(
    'documents.transact',
    'Apply engine commands atomically to the active editor; one undo step. Reuse operationId only for an identical retry.',
    {
      projectId,
      expectedRevision: revision,
      operationId: string,
      commands: {
        type: 'array',
        minItems: 1,
        maxItems: 1000,
        items: schema({ type: string, payload: {} }, ['type', 'payload']),
      },
    },
    ['projectId', 'expectedRevision', 'operationId', 'commands'],
  ),
  ...['undo', 'redo'].map((method) =>
    definition(
      `documents.${method}`,
      `Use the active editor's ${method} history. Reuse requestId for an identical retry.`,
      { projectId, expectedRevision: revision, requestId: string },
      ['projectId', 'expectedRevision', 'requestId'],
    ),
  ),
  definition(
    'assets.import',
    'Copy a local reference into the project. Returns an asset; insert it with document commands.',
    { projectId, source: string, kind: { type: 'string', enum: ['image', 'video', 'audio'] } },
    ['projectId', 'source', 'kind'],
  ),
  definition(
    'assets.resolve',
    'Resolve a saved project-media reference to a local file for inspection or use inside HTML. The source must belong to the specified project; opening it is unnecessary.',
    { projectId, source: string },
    ['projectId', 'source'],
  ),
  definition(
    'html.publish',
    'Compile HTML + TypeScript (default, no Vue), save source and bundle, then insert or update an HTML layer live. Animated HTML requires window.beamComposition.seek(timeMs).',
    {
      projectId,
      expectedRevision: revision,
      entry: string,
      width: { type: 'integer', minimum: 2, maximum: 16384 },
      height: { type: 'integer', minimum: 2, maximum: 16384 },
      durationMs: { ...integer, maximum: 86400000 },
      fps: { type: 'number', exclusiveMinimum: 0, maximum: 240, default: 30 },
      framework: { type: 'string', enum: ['html', 'vue'], default: 'html' },
      name: string,
      layerId: string,
      startMs: integer,
      references: {
        type: 'array',
        maxItems: 64,
        items: schema({ name: string, source: string, projectId }, ['name', 'source']),
      },
    },
    ['projectId', 'expectedRevision', 'entry', 'width', 'height', 'durationMs'],
  ),
  definition(
    'html.source',
    'Locate the persisted source of an HTML layer. Read its html descriptor from documents.snapshot.',
    { projectId, html: { type: 'object' } },
    ['projectId', 'html'],
  ),
  definition(
    'render.export',
    'Export the current open project to PNG/WebP or MP4/WebM. Uses the saved HTML code revisions and Beam renderer.',
    {
      projectId,
      output: string,
      format: { type: 'string', enum: ['mp4', 'webm'] },
      preset: { type: 'string', enum: ['low', 'medium', 'high'] },
      overwrite: { type: 'boolean', default: false },
    },
    ['projectId', 'output'],
  ),
  definition(
    'render.frame',
    'Capture a video timeline frame as PNG; useful to inspect before adjusting code.',
    { projectId, output: string, timeMs: integer, overwrite: { type: 'boolean', default: false } },
    ['projectId', 'output', 'timeMs'],
  ),
];

export function describeTool(name: string) {
  const tool = TOOL_CATALOG.find((item) => item.name === name);
  if (!tool) throw new Error(`Unknown tool: ${name}. Use beam tools list.`);
  return tool;
}

/** Enforce the advertised subset of JSON Schema before making a network or filesystem call. */
export function validateToolArguments(name: string, input: unknown): asserts input is Record<string, unknown> {
  const visit = (value: unknown, rule: Record<string, unknown>, path: string) => {
    if (rule.type === 'object') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object.`);
      const object = value as Record<string, unknown>;
      const properties = rule.properties as Record<string, Record<string, unknown>> | undefined;
      for (const required of (rule.required as string[]) ?? [])
        if (!(required in object)) throw new Error(`${path}.${required} is required.`);
      for (const [key, item] of Object.entries(object)) {
        if (properties?.[key]) visit(item, properties[key], `${path}.${key}`);
        else if (rule.additionalProperties === false) throw new Error(`Unknown argument: ${path}.${key}`);
      }
    } else if (rule.type === 'array') {
      if (
        !Array.isArray(value) ||
        value.length < Number(rule.minItems ?? 0) ||
        value.length > Number(rule.maxItems ?? Infinity)
      )
        throw new Error(`${path} must be an array within the advertised size bounds.`);
      for (const item of value) visit(item, rule.items as Record<string, unknown>, path);
    } else if (rule.type) {
      const kind = rule.type;
      if (
        (kind === 'integer' ? !Number.isSafeInteger(value) : typeof value !== kind) ||
        (typeof value === 'number' &&
          (!Number.isFinite(value) ||
            value < Number(rule.minimum ?? -Infinity) ||
            value > Number(rule.maximum ?? Infinity) ||
            value <= Number(rule.exclusiveMinimum ?? -Infinity))) ||
        (typeof value === 'string' && value.length < Number(rule.minLength ?? 0))
      )
        throw new Error(`Invalid ${path}.`);
    }
    if (Array.isArray(rule.enum) && !rule.enum.includes(value))
      throw new Error(`Invalid ${path}; allowed: ${rule.enum.join(', ')}.`);
  };
  visit(input, describeTool(name).inputSchema, name);
}
