import { ExportValidationError } from '../export-types';

export const safeExportErrorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Export failed.';
  return message
    .replace(/file:\/\/\/[^\s)]+/gi, '[local path]')
    .replace(/[A-Za-z]:\\(?:[^\s\\]+\\)*[^\s\\]+/g, '[local path]')
    .replace(/\/(?:home|Users|tmp|var)\/[^\s)]+/g, '[local path]');
};

export const technicalExportError = (error: unknown) => {
  const issue = error instanceof ExportValidationError ? error.issue : null;
  const safeMessage = safeExportErrorMessage(error);
  return issue ? JSON.stringify({ ...issue, message: safeMessage }, null, 2) : safeMessage;
};
