## catalog-part

Catalogue de pièces pour les franchisés Jumbo Pneus.
Next.js, Drizzle ORM, SQLite, RapidAPI auto-parts-catalog.

L'architecture et les conventions sont décrites dans `CLAUDE.md`.

### Setup

Copy `.env.example` to `.env` and fill in the values.

```sh
cp .env.example .env
pnpm install
pnpm db:generate
pnpm db:migrate
```

### Development

```sh
pnpm dev   # http://localhost:3000
```

Créer le premier compte, aucune interface n'étant accessible sans :

```sh
pnpm auth:user create <login> --password "..."
```

### Database

```sh
pnpm db:generate    # generate a migration from the schema
pnpm db:migrate     # apply pending migrations
pnpm drizzle-kit studio  # browse the database in a web UI
```