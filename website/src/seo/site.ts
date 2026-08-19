export const SITE_NAME = 'Beam';
export const SITE_URL = 'https://beam.plinka.eu';
export const REPOSITORY_URL = 'https://github.com/BeamRecorder/Beam';
export const RELEASES_URL = `${REPOSITORY_URL}/releases/latest`;
export const SOCIAL_IMAGE_PATH = '/Beam-showcase.png';

export const absoluteSiteUrl = (path: string): string => new URL(path, SITE_URL).toString();

export const canonicalUrl = (path: string): string => {
  const normalizedPath = path === '/' ? '/' : `/${path.replace(/^\/+|\/+$/g, '')}`;
  return absoluteSiteUrl(normalizedPath);
};
