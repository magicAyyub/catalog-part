# Fixture Server — Local mock for auto-parts-catalog.p.rapidapi.com

A zero-cost local mock server that mirrors the **Auto Parts Catalog RapidAPI**.  
All responses are **dynamically generated** with [`@faker-js/faker`](https://fakerjs.dev/) — no static files, no fixtures folder.

## Quick start

```bash
cd fixture-server
npm install
npm start          # → http://localhost:4000
```

For auto-reload during development:
```bash
npm run dev
```

## How to use in your app

Set an environment variable for the API base URL and swap it per environment:

```env
# .env.development
API_BASE_URL=http://localhost:4000

# .env.production
API_BASE_URL=https://auto-parts-catalog.p.rapidapi.com
```

Then in your fetch calls:
```js
const BASE = process.env.API_BASE_URL;
fetch(`${BASE}/types/list-vehicles-type`);
```

## How data generation works

Every request is hashed (path + params + query string) to seed `faker`:

```
URL + params  →  FNV-1a hash  →  faker.seed(hash)  →  generated response
```

**Same params → same data every time. Different params → different data.**  
Responses are realistic and stable across server restarts — great for testing UI flows.

## Available routes

| Route | Key param(s) | Behaviour |
|---|---|---|
| `GET /types/list-vehicles-type` | — | Static list (PC, CV, Motorcycle…) |
| `GET /manufacturers/list/type-id/:typeId` | `typeId` | Different set per type |
| `GET /models/list/type-id/:typeId/manufacturer-id/:mfrId/lang-id/:langId/country-filter-id/:ctryId` | `mfrId` | Different models per manufacturer |
| `GET /types/type-id/:typeId/list-vehicles-types/:modelId/lang-id/:langId/country-filter-id/:ctryId` | `modelId` | Different engines per model |
| `GET /category/type-id/:typeId/products-groups-variant-3/:vehicleId/lang-id/:langId` | `vehicleId` | Different category tree per vehicle |
| `GET /category/list-products-names/lang-id/:langId` | `langId` | Product name list |
| `GET /suppliers/list` | — | Static supplier pool |
| `GET /articles/list/type-id/:typeId/vehicle-id/:vehicleId/category-id/:catId/lang-id/:langId` | `vehicleId` + `catId` | Different articles per combo |
| `GET /articles/article-all-media-info?articleId=&langId=` | `?articleId` | Different images per article |
| `GET /articles/article-complete-details/type-id/:typeId?articleId=&langId=&countryFilterId=` | `?articleId` | Full article + compatible cars |
| `GET /articles/selection-of-the-criteria-for-articles-and-vehicle/type-id/:typeId/product-id/:pid/vehicle-id/:vid/supplier-id/:sid/lang-id/:langId/country-filter-id/:ctryId` | all path params | Criteria per article/vehicle/supplier |
| `GET /languages` | — | Static language list |

> Unknown routes return `404` with the full list of registered routes.

## Adding a new endpoint

1. Add a generator function in `server.js`:
   ```js
   function genMyThing(params) {
     return Array.from({ length: faker.number.int({ min: 3, max: 10 }) }, () => ({
       id:   faker.number.int({ min: 1, max: 9999 }),
       name: faker.commerce.productName(),
     }));
   }
   ```
2. Register the route:
   ```js
   app.get('/my/new/endpoint/:someId', (req, res) => {
     seedFromRequest(req);
     res.json(genMyThing(req.params));
   });
   ```
3. Restart the server — no files to create.
