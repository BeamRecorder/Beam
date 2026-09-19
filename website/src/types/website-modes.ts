import type { Component } from 'vue';

export type WebsiteModeId = 'instant' | 'studio' | 'screenshot';

export interface WebsiteModeOption {
  id: WebsiteModeId;
  label: string;
  icon: Component;
}

export interface WebsiteModeStep {
  title: string;
  text: string;
}

export interface WebsiteModeSummary {
  id: WebsiteModeId;
  label: string;
  title: string;
  description: string;
  bestFor: string;
  icon: Component;
  tone: 'blue' | 'violet' | 'green';
  steps: readonly string[];
}

export interface WebsiteModeSpotlightContent {
  id: WebsiteModeSummary['id'];
  eyebrow: string;
  icon: Component;
  title: string;
  description: string;
  features: readonly WebsiteModeStep[];
  tone: WebsiteModeSummary['tone'];
  media: 'instant' | 'studio' | 'screenshot';
  reverse?: boolean;
}
