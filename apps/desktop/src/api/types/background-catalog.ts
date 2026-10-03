export interface BackgroundCatalogRequest {
  operation: 'remove' | 'restore' | 'undo' | 'redo';
  id: string;
}

export interface BackgroundCatalogHistory {
  version: 1;
  id: string;
  deleted: boolean;
}
