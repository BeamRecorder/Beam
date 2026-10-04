import { watch, onScopeDispose } from 'vue';
import { capture } from '~/api/capture';
import { createDocumentEndpoint } from '@beam/engine/document/document-endpoint';
import { createHostedDocumentSession } from '@beam/engine/document/hosted-document-session';
import type { AuthoringHost } from './authoring-host-types';

export function useAuthoringHost<T extends object>(host: AuthoringHost<T>) {
  let endpoint: ReturnType<typeof createDocumentEndpoint<T>> | null = null;
  let activeId: string | null = null;
  let disposed = false;
  const stop = capture.onAuthoringRequest(async ({ id, request }) => {
    if (!endpoint || !host.context() || host.context()?.projectId !== activeId) return;
    const current = endpoint;
    const isCurrent = () => !disposed && endpoint === current && host.context()?.projectId === activeId;
    const response = await current.receive(request);
    if (!isCurrent()) return;
    if (response.ok && request.method !== 'snapshot') {
      try {
        await host.save();
      } catch (error) {
        if (!isCurrent()) return;
        capture.replyAuthoringRequest(id, {
          version: 1,
          id: request.id,
          ok: false,
          error: {
            code: 'invalid-request',
            message: `Edit applied but persistence failed: ${String(error)}. Inspect the current revision before retrying.`,
          },
        });
        return;
      }
    }
    for (const error of current.takeObserverErrors()) console.error('[Beam authoring observer]', error);
    if (isCurrent()) capture.replyAuthoringRequest(id, response);
  });
  watch(
    () => host.context()?.projectId ?? null,
    () => {
      const context = host.context();
      activeId = context?.projectId ?? null;
      endpoint = context ? createDocumentEndpoint(context.projectId, createHostedDocumentSession(host)) : null;
      void capture.registerAuthoringDocument(context).catch((error) => console.error('[Beam authoring]', error));
    },
    { immediate: true },
  );
  onScopeDispose(() => {
    disposed = true;
    endpoint = null;
    stop();
    void capture.registerAuthoringDocument(null).catch((error) => console.error('[Beam authoring]', error));
  });
}
