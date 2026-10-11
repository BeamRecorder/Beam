import { capture } from '~/api/capture';
import { useToastStore } from '~/ui/toast/toastStore';
export async function openApplicationSettings(): Promise<boolean> {
  try {
    return await capture.openHudSettings();
  } catch (reason) {
    useToastStore().error(reason instanceof Error ? reason.message : String(reason));
    return false;
  }
}
