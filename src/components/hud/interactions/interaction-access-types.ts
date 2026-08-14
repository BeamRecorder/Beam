import type { InputAccessStatus } from '~/api/types/capture-api';

export type InteractionAccessViewState =
  | InputAccessStatus
  | {
      state: 'checking';
      canRequest: false;
      clicks: false;
      shortcuts: false;
      recordsText: false;
    };
