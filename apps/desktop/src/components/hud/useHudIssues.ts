import { computed, onBeforeUnmount, ref, type Ref } from 'vue';
import { capture } from '~/api/capture';
import { linuxInteractionGuidance, linuxRequirementGuidance } from '~/api/linux-requirement-guidance';
import { useTranslate } from '~/i18n/useTranslate';
import type { CaptureCatalog } from '~/api/types/capture-api';
import type { useInteractionAccess } from './interactions/useInteractionAccess';
import type { HudIssueModel } from './hud-issue-types';

export function useHudIssues(
  captureCatalog: Ref<CaptureCatalog | null>,
  shownError: Ref<string>,
  interactionAccess: ReturnType<typeof useInteractionAccess>,
) {
  const { t } = useTranslate('HUD');
  const desktopPlatform = capture.platform;
  const interactionAuthorizedFeedback = ref(false);
  let interactionFeedbackTimeout: ReturnType<typeof setTimeout> | null = null;

  const requirementGuidance = computed(() => linuxRequirementGuidance(captureCatalog.value?.diagnostics?.linux));
  const interactionGuidance = computed(() => {
    const status = interactionAccess.status.value;
    if (status.state === 'checking') return null;
    return linuxInteractionGuidance(captureCatalog.value?.diagnostics?.linux, status);
  });
  const hudIssues = computed<HudIssueModel[]>(() => {
    const issues: HudIssueModel[] = [];
    if (requirementGuidance.value.length > 0) {
      issues.push({
        id: 'linux-requirements',
        title: t('linuxRequirementsTitle'),
        details: requirementGuidance.value.map((item) => `${item.title}: ${item.description}`),
        tone: 'error',
        copyText: requirementGuidance.value.map((item) => item.copyText).join('\n\n'),
        copyLabel: t('copyFix'),
        copiedLabel: t('copied'),
      });
    }
    if (shownError.value) {
      issues.push({
        id: 'recording-error',
        title: t('recordingErrorTitle'),
        details: [shownError.value],
        tone: 'error',
        copyText: shownError.value,
        copyLabel: t('copyError'),
        copiedLabel: t('copied'),
      });
    }
    if (desktopPlatform === 'linux' && interactionAuthorizedFeedback.value) {
      issues.push({
        id: 'interaction-success',
        title: t('interactionAccessGranted'),
        details: [t('interactionAccessGrantedDescription')],
        tone: 'success',
      });
    } else if (
      desktopPlatform === 'linux' &&
      (['permission-required', 'installation-required', 'denied'].includes(interactionAccess.status.value.state) ||
        (interactionAccess.status.value.state === 'unavailable' && interactionAccess.status.value.canRequest))
    ) {
      issues.push({
        id: 'interaction-access',
        title: t(
          interactionAccess.status.value.error ? 'interactionAccessUnavailableTitle' : 'interactionAccessNoticeTitle',
        ),
        details: [
          interactionAccess.status.value.error?.message ||
            (interactionAccess.status.value.state === 'denied'
              ? t('interactionAccessDeniedDescription')
              : t('interactionAccessNoticeDescription')),
        ],
        tone: interactionAccess.status.value.error ? 'error' : 'warning',
        actionLabel: interactionAccess.requesting.value ? t('authorizingInteractions') : t('authorizeInteractions'),
        actionLoading: interactionAccess.requesting.value,
        actionDisabled: interactionAccess.requesting.value,
      });
    } else if (desktopPlatform === 'linux' && interactionAccess.status.value.state === 'unavailable') {
      const guidance = interactionGuidance.value;
      issues.push({
        id: 'interaction-unavailable',
        title: guidance?.title || t('interactionAccessUnavailableTitle'),
        details: [guidance?.description || t('interactionAccessUnavailableDescription')],
        tone: 'info',
        copyText: guidance?.copyText,
        copyLabel: t('copyFix'),
        copiedLabel: t('copied'),
      });
    }
    return issues;
  });

  const authorizeInteractionAccess = async () => {
    await interactionAccess.request();
    if (interactionAccess.status.value.state !== 'available') return;
    interactionAuthorizedFeedback.value = true;
    if (interactionFeedbackTimeout) clearTimeout(interactionFeedbackTimeout);
    interactionFeedbackTimeout = setTimeout(() => {
      interactionAuthorizedFeedback.value = false;
    }, 1800);
  };

  const handleHudIssueAction = async (issueId: string) => {
    if (issueId === 'interaction-access') {
      await authorizeInteractionAccess();
    }
  };

  onBeforeUnmount(() => {
    if (interactionFeedbackTimeout) clearTimeout(interactionFeedbackTimeout);
  });
  return { hudIssues, authorizeInteractionAccess, handleHudIssueAction };
}
