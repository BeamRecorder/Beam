import type { ExportRuntimeDiagnostics } from './export-diagnostics-types';
import type { ExportFailureContext, ExportOperationContext } from './export-failure-types';

export class ExportOperationError extends Error {
  readonly failure: ExportFailureContext;
  diagnostics?: ExportRuntimeDiagnostics;

  constructor(error: unknown, context: ExportOperationContext) {
    const native = error instanceof Error || error instanceof DOMException;
    const name = native ? error.name : 'Error';
    const message = native ? error.message : String(error);
    const frame = context.frame;
    super(
      frame
        ? `${message} [${context.operation}; frame ${frame.index + 1} at ${(frame.timeMs / 1000).toFixed(3)} s; ${frame.width}×${frame.height}]`
        : message,
      { cause: error },
    );
    this.name = name;
    this.failure = { ...context, errorName: name.slice(0, 200), errorMessage: message.slice(0, 2000) };
  }
}

export function exportOperationError(error: unknown, context: ExportOperationContext) {
  if (error instanceof ExportOperationError || (error instanceof DOMException && error.name === 'AbortError'))
    return error;
  return new ExportOperationError(error, context);
}
