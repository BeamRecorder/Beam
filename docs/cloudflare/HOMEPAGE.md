# Homepage Beam sur Cloudflare Pages

La homepage vit dans `website/` et utilise les dependances du `package.json`
racine. Elle est publiee sur le projet Cloudflare Pages `beam-plinka`, avec
`master` comme branche de production et `https://beam.plinka.eu` comme domaine
canonique.

## Developpement local

```bash
npm ci
npm run website:dev
```

Validations ciblees :

```bash
npm run website:typecheck
npm run website:test
npm run website:build
npm run website:preview
```

Le build est ecrit dans `website/dist/`. Il ne doit pas etre commite.

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
