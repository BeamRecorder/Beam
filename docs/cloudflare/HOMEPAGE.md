# Homepage Beam sur Cloudflare Pages

Le site public vit dans le workspace Bun `website/`. Son `package.json` isole
les dependances SEO et documentation de l'application Electron, tandis que le
depot conserve un unique `bun.lock` racine. Le site est publie sur le
projet Cloudflare Pages `beam-plinka`, avec `master` comme branche de production
et `https://beam.plinka.eu` comme domaine canonique.

## Developpement local

```bash
bun install --frozen-lockfile
bun run website:dev
```

Cette commande demarre le site Vite et la documentation VitePress en parallele,
avec hot reload pour les composants Vue, les styles et les fichiers Markdown. Le
site est disponible sur `http://localhost:7000/` et la documentation sur
`http://localhost:7000/docs/` via le meme serveur public. VitePress utilise
le port interne `7001`, tandis que la preview de production utilise `7002`.

Pour ne lancer que le serveur VitePress :

```bash
bun run website:docs:dev
```

Validations ciblees :

```bash
bun run website:typecheck
bun run website:test
bun run website:build
bun run website:preview
```

Le build marketing Vite SSG et le build VitePress `/docs/` sont assembles dans
`website/dist/`. Le finalizer valide les metadonnees, sitemaps et pages statiques,
puis genere la CSP de `website/dist/_headers` a partir des scripts inline reels.
Le dossier de sortie ne doit pas etre commite.

## Publication

Le projet Pages utilise Direct Upload. L'integration Git de Cloudflare doit
rester desactivee : GitHub Actions est l'unique chemin de publication normal.

Un push sur `master` ne deploie que si toutes les conditions suivantes sont
reunies :

- le compte qui declenche le push et une eventuelle relance est `ExtraBinoss` ;
- le dernier message de commit commence exactement par `[HOMEPAGE]` ;
- le build, le typecheck et les tests du site reussissent ;
- l'environnement GitHub `homepage-production` autorise la branche `master`.

Exemple de message :

```text
[HOMEPAGE] publish website
```

Le filtre porte sur le dernier commit du push. Une PR peut donc contenir des
commits ordinaires, puis utiliser un commit final ou un squash commit portant ce
prefixe.

## Configuration sensible

Les valeurs ne doivent jamais etre placees dans Git, un fichier `.env`, une
variable Vite ou les logs. Seuls leurs noms sont documentes :

- secret d'environnement GitHub : `CLOUDFLARE_API_TOKEN` ;
- variable d'environnement GitHub : `CLOUDFLARE_ACCOUNT_ID`.

Le token Cloudflare doit rester limite au compte concerne et a la permission
Cloudflare Pages en ecriture. Les workflows de pull request et de fork ne doivent
jamais recevoir l'environnement `homepage-production`.

La restriction de deploiement GitHub ne protege pas la branche Git. Elle ne bloque
donc pas les push directs ou les force-push de `ExtraBinoss`. Pour reecrire
l'historique, preferer `git push --force-with-lease`.

## Domaine et diagnostic

Le domaine `beam.plinka.eu` doit etre rattache comme custom domain Pages, et non
comme un CNAME isole. Pour diagnostiquer :

```bash
wrangler pages project list
dig beam.plinka.eu
curl -I https://beam.plinka.eu
```

Si le domaine doit etre recree, deployer d'abord une version saine sur
`beam-plinka.pages.dev`, puis ajouter le custom domain Pages et attendre son etat
actif avant de verifier DNS et TLS.

## Rollback

Depuis Cloudflare Pages, identifier le dernier deploiement de production sain et
le promouvoir. Pour repasser par Git, restaurer le contenu voulu sur `master`,
puis pousser un nouveau commit commencant par `[HOMEPAGE]`. Ne pas reutiliser un
token soupconne d'avoir fuite : le revoquer, en creer un nouveau avec le meme
perimetre minimal, puis remplacer le secret GitHub.
