import type { WebsiteLocale } from '@website/i18n';

export interface FaqItem {
  id: string;
  category: 'application' | 'creation' | 'comparisons' | 'community';
  question: string;
  answer: string;
  sourceUrl?: string;
  sourceLabel?: string;
}

export interface FaqPageCatalog {
  meta: { title: string; description: string };
  intro: { eyebrow: string; title: string; lede: string; ariaLabel: string };
  categories: Record<FaqItem['category'], string>;
  callout: { eyebrow: string; title: string; docs: string; github: string };
  items: readonly FaqItem[];
}

export interface FaqTranslation {
  meta: FaqPageCatalog['meta'];
  intro: FaqPageCatalog['intro'];
  categories: FaqPageCatalog['categories'];
  callout: FaqPageCatalog['callout'];
  items: readonly (readonly [question: string, answer: string, sourceLabel?: string])[];
}

const englishFaqItems: readonly FaqItem[] = [
  {
    id: 'what-is-beam',
    category: 'application',
    question: 'What is Beam?',
    answer:
      'Beam is a free, open-source screen recorder and video editor for creating polished product demos on Windows, macOS, and Linux.',
  },
  {
    id: 'free-open-source',
    category: 'application',
    question: 'Is Beam really free and open source?',
    answer:
      'Yes. Beam is released under the MIT License with no subscription required. Its public GitHub repository lets the community inspect the code, report bugs, request features, and contribute improvements.',
    sourceUrl: 'https://github.com/BeamRecorder/Beam',
    sourceLabel: 'View Beam on GitHub',
  },
  {
    id: 'platform-support',
    category: 'application',
    question: 'Does Beam work on Windows, macOS, and Linux?',
    answer:
      'Yes. Beam ships for Windows, macOS, and Linux. Its Rust capture engine owns platform-specific screen, cursor, audio, timing, and encoding backends instead of relying on one generic browser recorder for every operating system.',
  },
  {
    id: 'recording-sources',
    category: 'creation',
    question: 'What can I record with Beam?',
    answer:
      'Beam can record a full display, an application window, or a custom region, with optional webcam, microphone, and system-audio tracks.',
  },
  {
    id: 'local-captions',
    category: 'creation',
    question: 'Does AI caption generation upload audio to the cloud?',
    answer:
      'No. Beam generates captions locally with Whisper, without cloud uploads, API keys, or an additional subscription.',
  },
  {
    id: 'editing-tools',
    category: 'creation',
    question: 'What editing tools are included?',
    answer:
      'Beam includes editable zooms, cursor smoothing and styling, local captions, canvas backgrounds, blur, audio controls, and a multi-track timeline built for product demos and tutorials.',
  },
  {
    id: 'export-formats',
    category: 'creation',
    question: 'Which export formats does Beam support?',
    answer: 'Beam exports recordings to MP4 or WebM at resolutions up to 4K.',
  },
  {
    id: 'beam-vs-screen-studio',
    category: 'comparisons',
    question: 'Beam vs Screen Studio: which screen recorder should I choose?',
    answer:
      'Screen Studio is a polished commercial recorder designed for macOS. Beam is the better fit when you want a free and open-source Screen Studio alternative for Windows, macOS, or Linux, with native capture, editable zooms, cursor effects, local captions, and a full timeline without a subscription.',
    sourceUrl: 'https://screen.studio/',
    sourceLabel: 'Review Screen Studio’s official product and pricing information',
  },
  {
    id: 'beam-vs-tella',
    category: 'comparisons',
    question: 'Beam vs Tella: what is the difference?',
    answer:
      'Tella focuses on hosted recording, sharing, embedding, and team workflows through paid plans. Beam is a free local desktop recorder and editor: projects stay on your computer, captions run locally, and the source code is open to the community. Choose Tella for managed cloud sharing; choose Beam for local control and subscription-free editing.',
    sourceUrl: 'https://www.tella.tv/help/introduction/plans',
    sourceLabel: 'Review Tella’s official plan information',
  },
  {
    id: 'beam-vs-openscreen',
    category: 'comparisons',
    question: 'Beam vs OpenScreen: how do the open-source recorders compare?',
    answer:
      'Both Beam and OpenScreen target polished recordings without a subscription. Beam differentiates itself with an actively developed community project, a Rust capture engine with platform-specific backends, local Whisper captions, and an integrated multi-track editor. The original OpenScreen repository announced its final release and was archived in June 2026.',
    sourceUrl: 'https://github.com/siddharthvaddem/openscreen/releases',
    sourceLabel: 'Review the original OpenScreen release history',
  },
  {
    id: 'beam-vs-obs',
    category: 'comparisons',
    question: 'Beam vs OBS Studio: which is better for recording product demos?',
    answer:
      'OBS Studio is a powerful free and open-source tool for live streaming, real-time scene mixing, capture cards, and configurable broadcast workflows. Beam is more focused on recording and polishing product demos with automatic presentation tools such as editable zooms, cursor motion, captions, backgrounds, and a video timeline. Choose OBS for streaming and complex live scenes; choose Beam for a focused record-edit-export workflow.',
    sourceUrl: 'https://obsproject.com/',
    sourceLabel: 'Review OBS Studio’s official feature list',
  },
  {
    id: 'beam-vs-loom',
    category: 'comparisons',
    question: 'Beam vs Loom: should I use a local recorder or cloud video messaging?',
    answer:
      'Loom is designed around quickly recording, hosting, sharing, and collaborating on cloud video messages, with plan limits and paid collaboration or AI features. Beam is a free, open-source desktop recorder and editor for locally controlled files and polished exports. Choose Loom for hosted asynchronous team communication; choose Beam when local ownership and detailed editing matter most.',
    sourceUrl: 'https://www.loom.com/pricing',
    sourceLabel: 'Review Loom’s official plans and limits',
  },
  {
    id: 'community',
    category: 'community',
    question: 'How can I contribute to Beam?',
    answer:
      'You can inspect the source, report issues, propose features, contribute code through GitHub, and join the Beam Discord community for help and project updates.',
    sourceUrl: 'https://github.com/BeamRecorder/Beam',
    sourceLabel: 'Contribute to Beam on GitHub',
  },
] as const;

const frenchFaqItems: readonly FaqItem[] = [
  {
    id: 'what-is-beam',
    category: 'application',
    question: 'Qu’est-ce que Beam ?',
    answer:
      'Beam est un enregistreur d’écran et un éditeur vidéo gratuit et open source, conçu pour créer des démonstrations produit soignées sur Windows, macOS et Linux.',
  },
  {
    id: 'free-open-source',
    category: 'application',
    question: 'Beam est-il vraiment gratuit et open source ?',
    answer:
      'Oui. Beam est publié sous licence MIT et ne nécessite aucun abonnement. Son dépôt GitHub public permet à la communauté de consulter le code, signaler des bugs, proposer des fonctionnalités et contribuer.',
    sourceUrl: 'https://github.com/BeamRecorder/Beam',
    sourceLabel: 'Voir Beam sur GitHub',
  },
  {
    id: 'platform-support',
    category: 'application',
    question: 'Beam fonctionne-t-il sur Windows, macOS et Linux ?',
    answer:
      'Oui. Beam est distribué pour Windows, macOS et Linux. Son moteur de capture en Rust utilise des backends adaptés à chaque système pour l’écran, le curseur, l’audio, la synchronisation et l’encodage.',
  },
  {
    id: 'recording-sources',
    category: 'creation',
    question: 'Que peut-on enregistrer avec Beam ?',
    answer:
      'Beam peut enregistrer un écran complet, une fenêtre ou une région personnalisée, avec des pistes optionnelles pour la webcam, le microphone et l’audio système.',
  },
  {
    id: 'local-captions',
    category: 'creation',
    question: 'La génération de sous-titres par IA envoie-t-elle l’audio dans le cloud ?',
    answer:
      'Non. Beam génère les sous-titres localement avec Whisper, sans envoi dans le cloud, clé API ni abonnement supplémentaire.',
  },
  {
    id: 'editing-tools',
    category: 'creation',
    question: 'Quels outils de montage sont inclus ?',
    answer:
      'Beam inclut des zooms modifiables, le lissage et le style du curseur, des sous-titres locaux, des arrière-plans, du flou, des réglages audio et une timeline multipiste.',
  },
  {
    id: 'export-formats',
    category: 'creation',
    question: 'Quels formats d’export Beam prend-il en charge ?',
    answer: 'Beam exporte les enregistrements en MP4 ou WebM, avec des résolutions allant jusqu’à la 4K.',
  },
  {
    id: 'beam-vs-screen-studio',
    category: 'comparisons',
    question: 'Beam vs Screen Studio : quel enregistreur d’écran choisir ?',
    answer:
      'Screen Studio est un enregistreur commercial soigné conçu pour macOS. Beam convient mieux si vous cherchez une alternative gratuite et open source à Screen Studio sur Windows, macOS ou Linux, avec capture native, zooms modifiables, effets de curseur, sous-titres locaux et timeline complète sans abonnement.',
    sourceUrl: 'https://screen.studio/',
    sourceLabel: 'Consulter le produit et les tarifs officiels de Screen Studio',
  },
  {
    id: 'beam-vs-tella',
    category: 'comparisons',
    question: 'Beam vs Tella : quelle est la différence ?',
    answer:
      'Tella privilégie l’enregistrement hébergé, le partage, l’intégration et les équipes avec des offres payantes. Beam est un enregistreur et éditeur local gratuit : les projets restent sur votre ordinateur, les sous-titres sont générés localement et le code est ouvert à la communauté.',
    sourceUrl: 'https://www.tella.tv/help/introduction/plans',
    sourceLabel: 'Consulter les offres officielles de Tella',
  },
  {
    id: 'beam-vs-openscreen',
    category: 'comparisons',
    question: 'Beam vs OpenScreen : comment comparer ces enregistreurs open source ?',
    answer:
      'Beam et OpenScreen visent tous deux des enregistrements soignés sans abonnement. Beam se distingue par un projet communautaire activement développé, un moteur de capture Rust avec backends propres à chaque plateforme, les sous-titres Whisper locaux et un éditeur multipiste intégré. Le dépôt OpenScreen original a annoncé sa dernière version puis a été archivé en juin 2026.',
    sourceUrl: 'https://github.com/siddharthvaddem/openscreen/releases',
    sourceLabel: 'Consulter l’historique des versions du projet OpenScreen original',
  },
  {
    id: 'beam-vs-obs',
    category: 'comparisons',
    question: 'Beam vs OBS Studio : lequel choisir pour une démonstration produit ?',
    answer:
      'OBS Studio est un outil gratuit et open source puissant pour le streaming, le mixage de scènes en direct et les workflows de diffusion configurables. Beam se concentre sur l’enregistrement puis le montage de démonstrations produit avec zooms modifiables, mouvements du curseur, sous-titres, arrière-plans et timeline vidéo.',
    sourceUrl: 'https://obsproject.com/',
    sourceLabel: 'Consulter la liste officielle des fonctionnalités OBS Studio',
  },
  {
    id: 'beam-vs-loom',
    category: 'comparisons',
    question: 'Beam vs Loom : enregistrement local ou messagerie vidéo cloud ?',
    answer:
      'Loom est pensé pour enregistrer, héberger, partager et commenter rapidement des messages vidéo dans le cloud, avec des limites selon les offres. Beam est un enregistreur et éditeur de bureau gratuit et open source pour conserver les fichiers localement et produire des exports travaillés.',
    sourceUrl: 'https://www.loom.com/pricing',
    sourceLabel: 'Consulter les offres et limites officielles de Loom',
  },
  {
    id: 'community',
    category: 'community',
    question: 'Comment contribuer à Beam ?',
    answer:
      'Vous pouvez consulter le code, signaler un problème, proposer une fonctionnalité, contribuer sur GitHub et rejoindre la communauté Discord de Beam.',
    sourceUrl: 'https://github.com/BeamRecorder/Beam',
    sourceLabel: 'Contribuer à Beam sur GitHub',
  },
] as const;

export const faqItems = englishFaqItems;

const englishCatalog: FaqPageCatalog = {
  meta: {
    title: 'Beam FAQ — Screen Studio, Tella, OpenScreen, OBS, and Loom alternative',
    description:
      'Compare Beam with Screen Studio, Tella, OpenScreen, OBS Studio, and Loom. Explore a free, open-source, cross-platform screen recorder and editor.',
  },
  intro: {
    eyebrow: 'Frequently asked questions',
    title: 'Everything you need to know about Beam.',
    lede: 'Factual answers about Beam, its features, and other screen recorders.',
    ariaLabel: 'Beam frequently asked questions',
  },
  categories: {
    application: 'Beam application',
    creation: 'Recording and editing',
    comparisons: 'Comparisons',
    community: 'Community',
  },
  callout: {
    eyebrow: 'Still curious?',
    title: 'Read the docs or ask the community.',
    docs: 'Read the documentation',
    github: 'Open GitHub',
  },
  items: englishFaqItems,
};

const frenchCatalog: FaqPageCatalog = {
  meta: {
    title: 'FAQ Beam — Alternative à Screen Studio, Tella, OpenScreen, OBS et Loom',
    description:
      'Comparez Beam à Screen Studio, Tella, OpenScreen, OBS Studio et Loom. Découvrez un enregistreur d’écran gratuit, open source et multiplateforme.',
  },
  intro: {
    eyebrow: 'Questions fréquentes',
    title: 'Tout ce qu’il faut savoir sur Beam.',
    lede: 'Des réponses factuelles sur Beam, ses fonctionnalités et les autres enregistreurs d’écran.',
    ariaLabel: 'Questions fréquentes sur Beam',
  },
  categories: {
    application: 'Application Beam',
    creation: 'Enregistrement et montage',
    comparisons: 'Comparaisons',
    community: 'Communauté',
  },
  callout: {
    eyebrow: 'Encore une question ?',
    title: 'Consultez la documentation ou demandez à la communauté.',
    docs: 'Lire la documentation',
    github: 'Ouvrir GitHub',
  },
  items: frenchFaqItems,
};

export const createFaqCatalog = (translation: FaqTranslation): FaqPageCatalog => {
  if (!translation.meta.title || !translation.intro.title || !translation.callout.title) {
    throw new Error('FAQ translation is missing required page headings.');
  }
  if (translation.items.length !== englishFaqItems.length) {
    throw new Error(`Expected ${englishFaqItems.length} translated FAQ items, received ${translation.items.length}.`);
  }
  return {
    ...translation,
    items: englishFaqItems.map((item, index) => {
      const translated = translation.items[index];
      if (!translated) throw new Error(`Missing FAQ translation at index ${index}.`);
      return {
        ...item,
        question: translated[0],
        answer: translated[1],
        sourceLabel: item.sourceUrl ? translated[2] : undefined,
      };
    }),
  };
};

const faqCatalogs: Partial<Record<WebsiteLocale, FaqPageCatalog>> = {
  en: englishCatalog,
  fr: frenchCatalog,
};

const translatedFaqModules = import.meta.glob('../i18n/*/faq.json', {
  eager: true,
  import: 'default',
}) as Record<string, FaqTranslation>;

for (const [path, translation] of Object.entries(translatedFaqModules)) {
  const locale = path.match(/\/i18n\/([^/]+)\/faq\.json$/)?.[1] as WebsiteLocale | undefined;
  if (locale) faqCatalogs[locale] = createFaqCatalog(translation);
}

export const getFaqCatalog = (locale: WebsiteLocale): FaqPageCatalog => faqCatalogs[locale] ?? englishCatalog;

export const localizedFaqItems = (locale: WebsiteLocale): readonly FaqItem[] => getFaqCatalog(locale).items;
