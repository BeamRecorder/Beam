export interface WebsiteFeatureImage {
  type: 'image';
  src: string;
  srcset: string;
  sizes: string;
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

export interface WebsiteFeature {
  title: string;
  media: WebsiteFeatureImage | WebsiteFeatureVideo;
}
