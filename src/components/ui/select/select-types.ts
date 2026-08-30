export interface SelectOption {
  value: string | number;
  label: string;
  thumbnail?: string;
  thumbnailFallback?: 'screen' | 'window';
  appIcon?: string | null;
  color?: string;
  loading?: boolean;
  keywords?: readonly string[];
}

export interface FuzzySearchEngine<T> {
  search(query: string): T[];
}
