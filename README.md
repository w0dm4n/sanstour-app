# sanstour-app — le site de Sanstour

Le site public de Sanstour (https://sanstour.com) : la vitrine du jeu aujourd'hui, l'espace compte plus tard.
Le jeu lui-même reste servi par le serveur de jeu sur https://jouer.sanstour.com.

Dépôt privé à part du jeu (`w0dm4n/Sanstour`), depuis le 2026-10-14. Le site parle au jeu seulement par son
API HTTP publique (`SANSTOUR_API_URL`).

- Next.js 16 (App Router, Turbopack, Cache Components), React 19, TypeScript
- Tailwind CSS v4 (loader `@tailwindcss/turbopack`, pas de `postcss.config`)
- `motion` pour les animations, `next/font` (police **Rowdies**), `next/image` (AVIF / WebP)
- **DA** : la référence est `design/da-sanstour.md` dans le dépôt du jeu (`w0dm4n/Sanstour`, elle sert
  aussi à la future interface du client) ; ses tokens vivent ici, dans le bloc `@theme` de
  `src/app/globals.css` (source unique).

> Next 16 a changé beaucoup d'API : avant d'écrire du code, lire la doc livrée avec la version installée,
> `node_modules/next/dist/docs/` (voir `AGENTS.md`, que `next dev` réécrit).

## Commandes

```sh
npm install                    # ou npm ci
npm run dev                    # développement : http://localhost:5630 (Turbopack)
npm run build                  # build de production (sortie .next/standalone)
npm run lint                   # ESLint
npm run typecheck              # next typegen + tsc --noEmit
npm start -- -p 5631           # sert le build : http://localhost:5631
npm run optimize-images -- --in <dossier> [--out public/images] [--max-width 1920] [--quality 82] [--format webp,avif,png]
```

`npm start` affiche un avertissement avec `output: "standalone"` mais sert bien le build pour un essai
local ; en production on lance `node server.js` depuis `.next/standalone` (c'est ce que fait l'image Docker).

Ports de ce poste : 5630 (dev) et 5631 (start).

## Preuves (captures, comparaison à la maquette, Lighthouse)

Sorties dans `preuves/` (gitignoré : ce sont des images du jeu). Chrome (ou Edge) du poste via
`puppeteer-core` / `chrome-launcher` : un seul Chrome headless à la fois (verrou partagé
`%TEMP%\sanstour-proof-chrome.lock`), profil temporaire supprimé à la fin, Chrome arrêté par PID.

```sh
npm run build && npm run serve:prod          # build de prod servi en standalone sur http://127.0.0.1:5631
npm run shoot -- --reduced-motion            # pleine page aux largeurs 390,768,1280,1600,2200,2752
npm run shoot -- --widths 1600 --scroll 1200 # viewport après défilement (parallax)
npm run compare -- --ref <figma-1600.png> --shot preuves/site-1600.png --sections "hero:0:1000,combat:1000:2100"
npm run lighthouse                           # mobile puis desktop ; rapports lighthouse-<preset>.html
```

- Lighthouse et les captures de référence : contre le build de production, jamais `next dev`.
- URL par défaut `127.0.0.1` et non `localhost` : le serveur écoute en IPv4, `localhost` essaie d'abord
  `::1` (≈ 0,3 s de plus par connexion sous Windows, ce qui fausse les mesures).
- Pleine page : capture `captureBeyondViewport` (Chrome 155) ; les `vh` gardent la hauteur de `--height`,
  mais tout est dessiné à l'état « défilement 0 » (fixed / sticky une seule fois en haut, parallax figé).
  Pour comparer à la maquette : `--reduced-motion`.
- Options : `node scripts/<outil>.mjs --help`.

## Structure

```
site/
  next.config.ts            standalone, AVIF/WebP, Cache Components, racine fixée sur ce dossier
  Dockerfile, .dockerignore image node:24-alpine, utilisateur non root, port 3000
  .env.example              variables d'environnement (aucun secret)
  scripts/optimize-images.mjs  PNG/JPG/WebP → WebP/AVIF/PNG redimensionnés (sharp)
  public/images/            images du site (sorties du script)
  src/app/layout.tsx        <html lang="fr">, police Rowdies (--font-rowdies), métadonnées de base
  src/app/globals.css       Tailwind + bloc @theme des tokens de la DA
  src/app/(vitrine)/page.tsx   la landing (/)
  src/lib/api/              client typé de l'API du jeu (serveur seulement)
    types.ts                types recopiés du code serveur (fichiers sources cités en tête)
    client.ts               register, login, logout, listCharacters, createCharacter,
                            deleteCharacter, getMeta, fetchStatus, getStatus (mis en cache 30 s)
    index.ts
```

## Variables d'environnement

| Variable           | Défaut                      | Rôle |
|--------------------|-----------------------------|------|
| `SANSTOUR_API_URL` | `https://jouer.sanstour.com` | Adresse de l'API du serveur de jeu, lue côté serveur seulement. |
| `SITE_URL`         | `https://sanstour.com`       | `metadataBase` (URL absolues des métadonnées, Open Graph). |

Les deux sont lues **au build** (métadonnées et données en cache prérendues) puis à l'exécution : les
fixer aux deux moments (`ARG` et `ENV` du Dockerfile). En local, copier `.env.example` en `.env.local`.
Aucune variable `NEXT_PUBLIC_*` : rien de cette configuration n'est envoyé au navigateur.

## L'API du jeu (`src/lib/api`)

D'après `server/src/core/http.ts` et `auth.ts` : corps JSON, réponses JSON `Cache-Control: no-store`,
erreurs `{ error: <code>, message: <texte français> }` avec le statut HTTP.

| Méthode et route              | Auth   | Corps                      | Réponse |
|-------------------------------|--------|----------------------------|---------|
| `POST /api/register`          | –      | `{ username, password }`   | 201 `{ token }` ; 400, 409 `username_taken`, 429 |
| `POST /api/login`             | –      | `{ username, password }`   | 200 `{ token }` ; 401 `invalid_credentials`, 429 |
| `POST /api/logout`            | Bearer | –                          | 200 `{ ok: true }` |
| `GET /api/characters`         | Bearer | –                          | 200 `{ characters: CharacterRecord[] }` |
| `POST /api/characters`        | Bearer | `{ name, classId, gender, colors?, head? }` | 201 `{ character }` ; 400, 403, 409 |
| `DELETE /api/characters/:id`  | Bearer | –                          | 200 `{ ok: true }` ; 404, 409 `character_online` |
| `GET /api/meta`               | –      | –                          | 200 royaume, classes, protocole, versions d'assets |
| `GET /api/status`             | –      | –                          | 200 joueurs en ligne, hubs, instances, tick |

Auth = en-tête `Authorization: Bearer <jeton>` ; jeton absent, inconnu ou expiré → 401 `unauthorized`.
Le jeton vaut 30 jours (`TOKEN_TTL_MS`). Register et login partagent une limite de 30 essais par minute et
par adresse **vue du serveur de jeu** (`req.socket.remoteAddress`, sans `X-Forwarded-For`).

Le client lève `SanstourApiError` (`status`, `code`, `message`) ; `getStatus()` est une fonction
« use cache » (cacheLife 30 s) qui rend un `ApiResult` au lieu de lever, une erreur ne traversant pas une
portée « use cache » intacte en production.

## Plan : les comptes (à venir, pas encore construit)

Rien de ceci n'existe encore : c'est le plan à suivre quand l'espace compte sera fait.

- **Routes.** Aujourd'hui un seul groupe, `src/app/(vitrine)/`. Plus tard un groupe `src/app/(compte)/` avec
  son propre layout : `(compte)/connexion`, `(compte)/inscription`, `(compte)/profil` (ses personnages)…
  Les groupes ne changent pas les URL (`/connexion`, `/profil`).
- **Relais côté serveur.** Le navigateur ne parle jamais à l'API du jeu. Les formulaires appellent des
  actions serveur ou des route handlers Next (`src/app/api/...`, par ex. `api/connexion`,
  `api/deconnexion`) qui appellent `src/lib/api` vers `SANSTOUR_API_URL`.
- **Jeton.** Le jeton bearer rendu par `/api/login` (ou `/api/register`) est posé par le serveur du site
  dans un cookie `httpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, durée 30 jours au plus (`TOKEN_TTL_MS`),
  et **jamais** dans `localStorage` ni dans du JavaScript client. La déconnexion appelle `/api/logout`
  puis efface le cookie. Un 401 `unauthorized` de l'API efface le cookie et renvoie vers `/connexion`.
- **Lecture.** Les server components lisent le cookie (`cookies()`) et appellent `src/lib/api` côté
  serveur en passant le jeton. Avec Cache Components, ces parties dépendent de la requête : elles vont
  sous `<Suspense>` et jamais dans une portée « use cache » (voir
  `node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md`).
- **CORS / origine.** Le jeu est sur `jouer.sanstour.com`, le site sur `sanstour.com` : deux origines.
  Le serveur de jeu n'envoie aucun en-tête CORS (et répond 401 à un `OPTIONS` de pré-vol), donc un appel
  direct depuis le navigateur du site échouerait. Le relais côté serveur évite la question : seul le
  navigateur applique CORS, et le cookie reste sur `sanstour.com` (aucun cookie partagé entre les deux
  domaines). Les mutations passent par des actions serveur (protégées par Next contre les origines
  étrangères) ou des route handlers `POST` qui vérifient l'en-tête `Origin`.
- **Limite d'essais.** Vus du serveur de jeu, tous les login relayés viennent de l'adresse du serveur du
  site (et en prod, derrière nginx, toutes les connexions viennent déjà de la même adresse locale) : la
  limite de 30 essais par minute devient commune à tous les joueurs. À régler côté serveur de jeu avant
  d'ouvrir la connexion sur le site (clé sur `X-Forwarded-For` de confiance, ou limite propre au site).
- **Adresse interne.** Si le site tourne sur la même machine que le jeu, `SANSTOUR_API_URL` peut viser
  le serveur de jeu sans passer par Cloudflare (réseau Docker commun) ; par défaut, l'adresse publique.
