## catalog-part

Auto parts catalog (Next.js, Drizzle ORM, SQLite, RapidAPI auto-parts-catalog).

### Config

Copy `.env.example` to `.env` and fill in the values.

```sh
cp .env.example .env
```

Key variables:

- `USE_MOCK_API` — set to `true` to use the local fixture server instead of RapidAPI (no key required)
- `MOCK_BASE_URL` — fixture server address, default `http://localhost:4000`
- `RAPIDAPI_KEY` — required only when `USE_MOCK_API=false`
- `SQLITE_PATH` — path to the SQLite database file, default `./data/app.db`

### First run

```sh
pnpm install
cd fixture-server && npm install && cd ..
pnpm db:generate
pnpm db:migrate
```

### Development

- Run `pnpm dev:mock` to start the fixture server and Next.js together
- The app is accessible at `http://localhost:3000`
- The fixture server runs at `http://localhost:4000`
- Run `pnpm sync:vehicle [vehicleId]` to populate the database for a given vehicle (fixture server must be running)
- Run `pnpm dev` if the fixture server is already running separately

### Database

- Run `pnpm db:generate` to generate a migration from the schema
- Run `pnpm db:migrate` to apply pending migrations to the SQLite file
- Run `pnpm drizzle-kit studio` to browse the database in a web UI

### Switching to production API

Set in `.env`:

```sh
USE_MOCK_API=false
RAPIDAPI_KEY=your_key_here
```

Then use `pnpm dev` instead of `pnpm dev:mock`.
