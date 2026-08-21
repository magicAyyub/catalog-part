## catalog-part

Auto parts catalog (Next.js, Drizzle ORM, SQLite, RapidAPI auto-parts-catalog).

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

To reset and re-sync a vehicle manually:

```sh
pnpm sync:vehicle [vehicleId]
```

### Database

```sh
pnpm db:generate    # generate a migration from the schema
pnpm db:migrate     # apply pending migrations
pnpm drizzle-kit studio  # browse the database in a web UI
```