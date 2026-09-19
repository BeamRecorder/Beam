import type { Component } from 'vue';
import type { WebsiteModeId } from './website-modes';

export interface WebsiteFeatureImage {
  type: 'image';
  src: string;
  srcset: string;
  sizes: string;
  mobileSrc?: string;
  width: number;
  height: number;
  fit?: 'cover' | 'contain';
  containShape?: 'portrait' | 'landscape';
  backdrop?: string;
}

export interface WebsiteFeatureVideo {
  type: 'video';
  src: string;
  poster: string;
  width: number;
  height: number;
}

export interface WebsiteFeaturePlaceholder {
  type: 'placeholder';
  label: string;
  icon: Component;
}

export interface WebsiteFeature {
  title: string;
  media: WebsiteFeatureImage | WebsiteFeatureVideo | WebsiteFeaturePlaceholder;
}

export interface WebsiteFeatureGroup {
  title: readonly string[];
  description: string;
  features: readonly WebsiteFeature[];
}

export type WebsiteFeatureGroups = Record<WebsiteModeId, WebsiteFeatureGroup>;
