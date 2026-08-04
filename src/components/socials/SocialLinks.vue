<script setup lang="ts">
import Button from '~/ui/button/Button.vue';
import { capture } from '~/api/capture';
import { useTranslate } from '~/i18n/useTranslate';
import { resolvePublicAssetUrl } from '~/utils/public-asset';

const { t } = useTranslate('Socials');

const openDiscordInvite = () => {
  void capture.openDiscordInvite();
};

const openGithubRepository = () => {
  void capture.openGithubRepository();
};
</script>

<template>
  <div class="socials-section">
    <span class="socials-title">{{ t('title') }}</span>
    <span class="socials-description">{{ t('description') }}</span>
    <div class="social-links">
      <Button variant="secondary" size="sm" block @click="openDiscordInvite">
        <template #icon>
          <img
            :src="resolvePublicAssetUrl('/discord_svg.svg')"
            class="social-icon discord-icon"
            alt=""
            aria-hidden="true"
          />
        </template>
        {{ t('discord') }}
      </Button>
      <Button variant="secondary" size="sm" block @click="openGithubRepository">
        <template #icon>
          <img :src="resolvePublicAssetUrl('/github.svg')" class="social-icon github-icon" alt="" aria-hidden="true" />
        </template>
        {{ t('github') }}
      </Button>
    </div>
  </div>
</template>

<style scoped>
.socials-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.socials-title {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.socials-description {
  color: var(--text-muted);
  font-size: 11px;
}

.social-links {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.social-icon {
  width: 17px;
  height: 17px;
  object-fit: contain;
}

.github-icon {
  filter: brightness(0);
}

:global(:root.dark) .github-icon {
  filter: brightness(0) invert(1);
}
</style>
