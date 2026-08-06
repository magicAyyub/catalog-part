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

Les franchisés consultent largement le même parc. Renouveler de nuit les
véhicules connus rend les recherches de la journée instantanées sans un appel en
heure de pointe. Le script est idempotent et s'arrête de lui-même si le quota
mensuel est atteint. À planifier en cron :

```
0 3 * * *  cd /chemin/catalog-part && pnpm warm:vehicles >> logs/warm.log 2>&1
```
