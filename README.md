## catalog-part

Auto parts catalog (Next.js, Drizzle ORM, SQLite, RapidAPI auto-parts-catalog).

### Setup

Copy `.env.example` to `.env` and fill in the values.

```sh
cp .env.example .env
pnpm install
cd fixture-server && npm install && cd ..
pnpm db:generate
pnpm db:migrate
```

### Configuration

All behavior is controlled via `.env`. No need to touch the source code.

| Variable | Description | Default |
|---|---|---|
| `USE_MOCK_API` | `true` = fixture server local, `false` = RapidAPI production | `true` |
| `RAPIDAPI_KEY` | Required when `USE_MOCK_API=false` | — |
| `MOCK_BASE_URL` | Address of the fixture server | `http://localhost:4000` |
| `SQLITE_PATH` | Path to the SQLite database file | `./data/app.db` |
| `SYNC_TTL_DAYS` | How long a vehicle sync is kept before refresh | `30` |
| `ALLOWED_CATEGORY_IDS` | Comma-separated TecDoc category IDs to sync | `100030,100032` |
| `ALLOWED_SUPPLIER_IDS_PROD` | Supplier IDs to accept in production (real TecDoc IDs) | `7657,161,30,21,39` |
| `ALLOWED_SUPPLIER_IDS_MOCK` | Supplier IDs to accept in mock mode (fixture server IDs) | `2,8,12` |
| `AUTH_SECRET` | Session cookie signing key, 32 characters minimum. Required | — |
| `AUTH_SESSION_TTL_DAYS` | Session lifetime | `7` |

### Authentification

Le catalogue expose des prix d'achat nets : tout est fermé par défaut. Une route
est joignable sans session uniquement si elle figure dans `proxy.ts`, et les
pages protégées vivent sous `app/(app)/`, dont le layout exige une session.

```sh
openssl rand -base64 48   # à mettre dans AUTH_SECRET
pnpm auth:user create dupont --name "Garage Dupont" --franchise "Lyon Est"
```

Sans `--password`, un mot de passe fort est généré et affiché une seule fois.
Le passer en ligne de commande le laisse dans l'historique du shell.

```sh
pnpm auth:user list
pnpm auth:user password dupont   # réinitialise et ferme les sessions ouvertes
pnpm auth:user disable dupont    # révoque, effet immédiat
pnpm auth:user enable dupont
```

Deux niveaux de contrôle, volontairement :

- `proxy.ts` vérifie la signature et l'expiration du cookie. Sans base de
  données, donc sur chaque requête sans surcoût. Cela suffit à rediriger un
  navigateur, pas à servir des données.
- `requireUser()` (`lib/auth/guard.ts`) interroge la base. C'est le seul niveau
  qui sait qu'une session a été fermée ou qu'un compte a été désactivé depuis.
  Toute route qui renvoie des pièces, des prix ou des données véhicule l'appelle.

Cinq échecs consécutifs bloquent un compte 15 minutes. Les mots de passe sont
hachés en scrypt (`node:crypto`), les identifiants de session sont stockés
hachés en SHA-256, si bien qu'un dump de la table `sessions` ne fournit aucun
cookie rejouable.

### Development

```sh
pnpm dev:mock   # starts the fixture server + Next.js together
```

- App: `http://localhost:3000`
- Fixture server: `http://localhost:4000`

To reset and re-sync a vehicle manually:

```sh
pnpm sync:vehicle [vehicleId]   # fixture server must be running
```

### Database

```sh
pnpm db:generate    # generate a migration from the schema
pnpm db:migrate     # apply pending migrations
pnpm drizzle-kit studio  # browse the database in a web UI
```

### Switching to production API

Set in `.env`:

```sh
USE_MOCK_API=false
RAPIDAPI_KEY=your_key_here
```

Then run `pnpm dev` (no fixture server needed).

### Coût des appels TecDoc

Le catalogue vient de RapidAPI, facturé à l'appel. Ce que consomme chaque action :

| Action | Appels |
|---|---|
| Véhicule neuf (2 catégories) | **~10** — 2 listes d'articles + 1 critère par équipementier et par catégorie |
| Véhicule déjà en cache (< `SYNC_TTL_DAYS`) | **0** |
| Resynchronisation d'un véhicule complet | **0** — gardes sur articles et critères |
| Ouverture d'une fiche produit, 1re fois | **2** — détail + médias |
| Ouverture d'une fiche déjà consultée | **0** |
| Cascade marque / modèle / motorisation | **0** après la première visite de chaque niveau |

Trois mécanismes portent ces zéros :

- `api_cache` sans expiration pour les données immuables (référentiels, fiches
  article, médias). Les fiches article sont **compressées** (~10× : 274 Ko → 26 Ko)
  car une même référence revient sur des dizaines de véhicules.
- Gardes symétriques dans `sync-service` : ni les articles ni les critères ne
  sont rachetés s'ils sont déjà en base. `syncVehicle(..., { force: true })`
  passe outre, pour le renouvellement.
- `ALLOWED_SUPPLIER_IDS_PROD` : chaque marque de la liste coûte un appel critères
  par catégorie. C'est le levier le plus direct sur la facture.

### Pré-chauffage nocturne

```sh
pnpm warm:vehicles              # véhicules dont le cache expire bientôt
pnpm warm:vehicles 15901 32251  # K-Type explicites
```

### Identification par plaque

Un seul fournisseur, Exadis, appelé par `lib/plate/identify.ts` :

```
K-Type connu de l'index    -> terminé, 0 appel facturé
K-Type inconnu + libellés  -> remontée de la chaîne TecDoc
K-Type inconnu, sans       -> véhicule non confirmé, pièces justes quand même
```

Une requête, 680 ms mesurés bout en bout, qui rend le K-Type **et** les libellés
marque/modèle depuis la même réponse.

app-etf occupait la place de secours et a été retiré : il lisait son propre
K-Type chez Exadis, donc il tombait avec la source qu'il devait couvrir, et sa
route publique dégrade un K-Type manquant en `carId` de portail, c'est-à-dire
exactement le bug d'origine du projet. Un vrai second pilier devra être
indépendant d'Exadis, Distriauto ou Oscaro par exemple.

Le décodage des libellés est positionnel, calé sur des réponses réelles. S'il
casse un jour on perd le libellé, jamais l'identification : seul le K-Type est
obligatoire, et un véhicule non confirmé donne malgré tout les bonnes pièces,
puisque l'acquisition ne consomme que le `vehicleId`.

Sans `EXADIS_USERNAME` et `EXADIS_PASSWORD`, la recherche par plaque est fermée
et il reste la cascade marque / modèle / motorisation. Seuls le K-Type et ses
libellés sont prélevés chez le fournisseur, jamais un prix ni un article.

### Page de trace

`/logs` montre chaque étape d'une recherche dans l'ordre, avec les appels
facturés, les durées et la provenance de chaque K-Type. Rafraîchissement toutes
les 3 secondes, filtres par jour, niveau et action.

Elle demande un second mot de passe, `LOGS_PASSWORD` dans `.env`, distinct des
comptes franchisés : la trace expose les plaques consultées. Sans cette variable
la page reste fermée pour tout le monde. Cinq essais ratés bloquent le compte 15
minutes.

### Préparation nocturne

```sh
pnpm night:run --dry-run     # le plan et le coût estimé, aucun appel ne part
pnpm night:run               # plafonné par NIGHT_MAX_API_CALLS, 60 par défaut
pnpm night:run --budget 30   # plafond serré pour une exécution
```

Récolte de l'index, indexation des véhicules connus mais non couverts en
commençant par les moins chers, renouvellement des caches proches de
l'expiration, purge des sessions expirées, sauvegarde compacte de la base dans
`data/backups` avec rotation.

Le plafond porte sur les appels réellement consommés, relevés auprès de
l'indexeur, pas sur une estimation. Une nuit ne peut donc pas vider le quota.

```
0 3 * * *  cd /chemin/catalog-part && pnpm night:run >> logs/night.log 2>&1
```

### Index K-Type local

```sh
pnpm vehicles:harvest            # construit l'index depuis le cache, zéro appel facturé
pnpm vehicles:harvest --dry-run  # affiche ce qui serait enregistré
```

Un appel `Engine_Types_by_Model` renvoie toutes les motorisations d'un modèle,
mesuré à 22 par appel. Le résolveur n'en lisait qu'une. Elles sont désormais
toutes enregistrées dans `td_vehicle`, et un K-Type connu se résout sans appel
facturé. La commande ci-dessus récupère celles qui dorment déjà dans `api_cache` ;
ensuite l'index se remplit tout seul à chaque résolution.

Les franchisés consultent largement le même parc. Renouveler de nuit les
véhicules connus rend les recherches de la journée instantanées sans un appel en
heure de pointe. Le script est idempotent et s'arrête de lui-même si le quota
mensuel est atteint. À planifier en cron :

```
0 3 * * *  cd /chemin/catalog-part && pnpm warm:vehicles >> logs/warm.log 2>&1
```
