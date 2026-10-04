import { createScreenshotImageLoader } from '@beam/runtime/screenshot/screenshot-image-loader';
import { resolvePublicAssetUrl } from '~/utils/public-asset';

// Module state belongs to this renderer window and survives child editor replacement.
const images = createScreenshotImageLoader();
export const requestEditorImage = (source: string) => images.request(resolvePublicAssetUrl(source));
export const loadEditorImage = (source: string) => requestEditorImage(source).ready;
export const clearEditorImages = () => images.clear();
