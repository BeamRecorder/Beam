import { ref, type Ref } from 'vue';
import type { CaptureProject } from '~/api/types/capture-api';
import type { CanvasFrameCapture } from '../canvas/canvas-frame-capture';
import { capture } from '~/api/capture';
import { useTranslate } from '~/i18n/useTranslate';
import { useToastStore } from '~/ui/toast/toastStore';

interface CanvasScreenshotSource {
  captureCurrentFrame(): Promise<CanvasFrameCapture>;
}

interface CanvasScreenshotOptions {
  source: Ref<CanvasScreenshotSource | null>;
  project: () => CaptureProject | null | undefined;
}

export const canvasScreenshotName = (projectName: string, date: Date, locale: string) =>
  `${projectName} — ${new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'medium' }).format(date)}`;

export function useCanvasScreenshot(options: CanvasScreenshotOptions) {
  const { t, locale } = useTranslate('CanvasToolbar');
  const toast = useToastStore();
  const isCapturingScreenshot = ref(false);

  const takeCanvasScreenshot = async () => {
    const source = options.source.value;
    const project = options.project();
    if (!source || !project || isCapturingScreenshot.value) return;
    isCapturingScreenshot.value = true;
    try {
      const frame = await source.captureCurrentFrame();
      const screenshot = await capture.createScreenshotFromCanvas({
        bytes: frame.bytes,
        name: canvasScreenshotName(project.name, new Date(), locale.value),
      });
      toast.success(
        t('screenshotCreated'),
        3_000,
        {
          label: t('openInScreenshotEditor'),
          onClick: async () => {
            try {
              await capture.openScreenshot(screenshot.id, { disposition: 'new-window' });
            } catch (error) {
              toast.error(
                t('screenshotOpenFailed', { message: error instanceof Error ? error.message : String(error) }),
              );
              throw error;
            }
          },
        },
        { preview: { kind: 'image', src: screenshot.source, alt: screenshot.name } },
      );
    } catch (error) {
      toast.error(t('screenshotFailed', { message: error instanceof Error ? error.message : String(error) }));
    } finally {
      isCapturingScreenshot.value = false;
    }
  };

  return { isCapturingScreenshot, takeCanvasScreenshot };
}
