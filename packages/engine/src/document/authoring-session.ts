import { createDocumentSession } from './document-session';
import { createRenderCommands } from '../commands/render-commands';
import { createStillCommands } from '../screenshot/still-commands';
import { validateRenderDocument } from './render-document-validation';
import { validateStillDocument } from '../screenshot/still-document';
import type { StillDocument } from '../screenshot/still-document-types';
import type { CompositionSnapshot } from '../shared/render-document-types';
import type { DocumentSession } from './document-types';

/** Identical authoring ownership and command execution for UI, CLI and remote adapters. */
export function createAuthoringSession(document: StillDocument): DocumentSession<StillDocument>;
export function createAuthoringSession(document: CompositionSnapshot): DocumentSession<CompositionSnapshot>;
export function createAuthoringSession(document: StillDocument | CompositionSnapshot) {
  return 'kind' in document
    ? createDocumentSession(document, { commands: createStillCommands(), validate: validateStillDocument })
    : createDocumentSession(document, { commands: createRenderCommands(), validate: validateRenderDocument });
}
