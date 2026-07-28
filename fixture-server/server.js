/**
 * fixture-server/server.js — Dynamic, param-aware mock server
 *
 * Strategy: each request is hashed (path + params) → seeds @faker-js/faker
 * → same params always return the same data, different params = different data.
 *
 * Usage:
 *   npm start            → http://localhost:4000
 *   PORT=4000 npm start
 */

const express = require('express');
const cors = require('cors');
const { faker } = require('@faker-js/faker');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// ─── Seeding helper ──────────────────────────────────────────────────────────
// Deterministic: same URL + params → same seed → same fake data every time.
function seedFromRequest(req) {
  const key = req.path + JSON.stringify(req.params) + JSON.stringify(req.query);
  let h = 2166136261; // FNV-1a 32bit
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  faker.seed(h);
}

// Convenience: pick n random items from an array, seeded
function pick(arr, n) {
  return faker.helpers.arrayElements(arr, n);
}
function pickOne(arr) {
  return faker.helpers.arrayElement(arr);
}

// ─── Domain data pools ───────────────────────────────────────────────────────
const VEHICLE_TYPES = ['PC', 'CV', 'Motorcycle', 'LCV', 'DriverCab', 'Axle', 'Engine', 'Bus', 'Tractor'];
const FUEL_TYPES = ['Petrol', 'Diesel', 'Electric', 'Hybrid', 'LPG', 'CNG'];
const BODY_TYPES = ['Hatchback', 'Saloon', 'Estate', 'SUV', 'Coupe', 'Convertible', 'Van', 'Pickup'];
const MEDIA_TYPES = ['JPEG', 'JPG', 'PNG', 'GIF', 'WEBP'];
const MEDIA_INFO = ['Picture', 'Thumbnail', 'Technical Drawing', 'Exploded View'];
const CRITERIA_TYPES = ['MANDATORY,ONLY_ARTICLE', 'OPTIONAL,ONLY_ARTICLE', 'OPTIONAL', 'MANDATORY'];
const MANUFACTURERS = ['VOLKSWAGEN', 'BMW', 'AUDI', 'MERCEDES-BENZ', 'FORD', 'TOYOTA', 'RENAULT',
  'PEUGEOT', 'CITROEN', 'FIAT', 'OPEL', 'HYUNDAI', 'KIA', 'NISSAN', 'HONDA',
  'SKODA', 'SEAT', 'VOLVO', 'PORSCHE', 'FERRARI'];
const PART_NAMES = ['Air Filter', 'Oil Filter', 'Fuel Filter', 'Brake Pad Set', 'Brake Disc',
  'Spark Plug', 'Alternator', 'Starter', 'Water Pump', 'Timing Belt Kit',
  'Shock Absorber', 'Wheel Bearing', 'CV Joint', 'Clutch Kit', 'Radiator',
  'Turbocharger', 'EGR Valve', 'Mass Air Flow Sensor', 'Oxygen Sensor', 'Thermostat'];
const SUPPLIERS = ['MANN-FILTER', 'BOSCH', 'MAHLE', 'SKF', 'FEBI BILSTEIN', 'SACHS', 'HELLA',
  'VALEO', 'CONTINENTAL', 'NGK', 'DENSO', 'TRW', 'BREMBO', 'LUK', 'DAYCO',
  'GATES', 'PIERBURG', 'DELPHI', 'SIEMENS', 'FAG'];
const CRITERIA_NAMES = ['Voltage [V]', 'Length [mm]', 'Width [mm]', 'Height [mm]', 'Weight [kg]',
  'Diameter [mm]', 'Thread Size', 'Filter type', 'Battery Capacity [Ah]',
  'Cold-test Current, EN [A]', 'Hold-down Type', 'Terminal Type', 'Post Positions',
  'Number of Teeth', 'Bore [mm]', 'Pitch [mm]'];
const LANG_ISO = [
  { lngId: '1', lngIso2: 'de', lngDescription: 'Deutsch' },
  { lngId: '4', lngIso2: 'en', lngDescription: 'English (GB)' },
  { lngId: '6', lngIso2: 'fr', lngDescription: 'Français' },
  { lngId: '7', lngIso2: 'it', lngDescription: 'Italiano' },
  { lngId: '8', lngIso2: 'es', lngDescription: 'Español' },
  { lngId: '9', lngIso2: 'nl', lngDescription: 'Nederlands' },
  { lngId: '19', lngIso2: 'pl', lngDescription: 'polski' },
  { lngId: '16', lngIso2: 'ru', lngDescription: 'русский' },
];
const CATEGORY_NAMES = ['Body', 'Engine', 'Brakes', 'Suspension', 'Transmission', 'Electrical',
  'Fuel System', 'Exhaust', 'Steering', 'Cooling System', 'Air/Climate',
  'Lighting', 'Chassis', 'Drive Shaft', 'Wheel & Tyre'];
const SUB_CATEGORIES = ['Filter', 'Sensor', 'Valve', 'Pump', 'Bearing', 'Gasket', 'Belt', 'Hose',
  'Pad Set', 'Disc', 'Caliper', 'Spring', 'Shock Absorber', 'Mount', 'Seal'];

// ─── Generators ──────────────────────────────────────────────────────────────

function genVehicleTypes() {
  // This list is static domain data — always the same regardless of params
  return VEHICLE_TYPES.map((t, i) => ({ id: i + 1, vehicleType: t }));
}

function genManufacturers(typeId) {
  const count = faker.number.int({ min: 15, max: 50 });
  const names = faker.helpers.shuffle([...MANUFACTURERS]);
  return {
    countManufactures: count,
    manufacturers: Array.from({ length: Math.min(count, names.length) }, (_, i) => ({
      manufacturerId: faker.number.int({ min: 100, max: 9999 }),
      manufacturerName: names[i] ?? faker.company.name().toUpperCase(),
    })),
  };
}

function genModels(params) {
  const count = faker.number.int({ min: 5, max: 30 });
  const mfr = pickOne(MANUFACTURERS);
  const bodies = faker.helpers.shuffle([...BODY_TYPES]);
  return {
    countModels: count,
    models: Array.from({ length: count }, (_, i) => {
      const startYear = faker.number.int({ min: 1985, max: 2018 });
      const endYear = faker.number.int({ min: startYear + 2, max: 2025 });
      const body = bodies[i % bodies.length];
      const series = faker.number.int({ min: 1, max: 9 });
      const variant = faker.string.alphanumeric({ length: 3, casing: 'upper' });
      return {
        modelId: faker.number.int({ min: 1, max: 99999 }),
        modelName: `${series}${faker.number.int({ min: 10, max: 90 })} ${body} (${variant})`,
        modelYearFrom: `${startYear}-${String(faker.number.int({ min: 1, max: 12 })).padStart(2, '0')}-01`,
        modelYearTo: `${endYear}-${String(faker.number.int({ min: 1, max: 12 })).padStart(2, '0')}-01`,
      };
    }),
  };
}

function genEngineTypes(params) {
  const mfr = pickOne(MANUFACTURERS);
  const body = pickOne(BODY_TYPES);
  const count = faker.number.int({ min: 3, max: 20 });
  return {
    modelType: pickOne(VEHICLE_TYPES),
    countModelTypes: count,
    modelTypes: Array.from({ length: count }, () => {
      const cc = pickOne([1.0, 1.2, 1.4, 1.6, 1.8, 2.0, 2.2, 2.5, 3.0, 3.5, 4.0]);
      const fuel = pickOne(FUEL_TYPES);
      const cyl = pickOne([3, 4, 6, 8]);
      const sy = faker.number.int({ min: 1990, max: 2018 });
      const ey = faker.number.int({ min: sy + 2, max: 2025 });
      const kw = faker.number.int({ min: 50, max: 400 });
      const modelSeries = faker.string.alphanumeric({ length: 2, casing: 'upper' });
      return {
        vehicleId: faker.number.int({ min: 1000, max: 200000 }),
        manufacturerName: mfr,
        modelName: `${mfr} Series ${modelSeries} ${body}`,
        typeEngineName: `${cc.toFixed(1)} ${fuel === 'Diesel' ? 'TDI' : 'TSI'}`,
        constructionIntervalStart: `${sy}-${String(faker.number.int({ min: 1, max: 12 })).padStart(2, '0')}-01`,
        constructionIntervalEnd: `${ey}-${String(faker.number.int({ min: 1, max: 12 })).padStart(2, '0')}-01`,
        powerKw: `${kw}.0000`,
        powerPs: `${Math.round(kw * 1.36)}.0000`,
        capacityTax: null,
        fuelType: fuel,
        bodyType: body,
        numberOfCylinders: cyl,
        capacityLt: `${cc.toFixed(1)}000`,
        capacityTech: `${Math.round(cc * 1000)}.0000`,
        engineCodes: faker.string.alphanumeric({ length: 4, casing: 'upper' }),
        engId: faker.number.int({ min: 10000, max: 99999 }),
      };
    }),
  };
}

function genCategories(params) {
  // Build a realistic tree: top-level categories → sub-categories
  const cats = faker.helpers.shuffle([...CATEGORY_NAMES]).slice(0, faker.number.int({ min: 5, max: 10 }));
  const subs = faker.helpers.shuffle([...SUB_CATEGORIES]);
  const result = {};
  cats.forEach((catName, ci) => {
    const catId = 100000 + ci * 100 + faker.number.int({ min: 1, max: 99 });
    const children = {};
    const numSubs = faker.number.int({ min: 1, max: 4 });
    subs.slice(ci * 2, ci * 2 + numSubs).forEach((subName, si) => {
      const subId = catId + si + 1;
      children[subId] = { text: `${catName} - ${subName}`, children: [] };
    });
    result[catId] = { text: catName, children };
  });
  return { categories: result };
}

function genProductNames(params) {
  const count = faker.number.int({ min: 20, max: 60 });
  return Array.from({ length: count }, (_, i) => ({
    productId: i + 1,
    productName: PART_NAMES[i % PART_NAMES.length],
  }));
}

function genSuppliers() {
  return SUPPLIERS.map((name, i) => ({
    supplierId: i + 1,
    supplierName: name,
    supplierMatchCode: `${name.split(' ')[0]} (${faker.string.alpha({ length: 3, casing: 'upper' })})`,
    supplierLogoName: `${name.replace(/\s/g, '_')}.PNG`,
  }));
}

function genArticleList(params) {
  const count = faker.number.int({ min: 5, max: 40 });
  const productName = pickOne(PART_NAMES);
  const productId = faker.number.int({ min: 1, max: 20 });
  return {
    vehicleId: params.vehicleId ?? String(faker.number.int({ min: 1000, max: 99999 })),
    categoryId: params.categoryId ?? String(faker.number.int({ min: 100001, max: 200000 })),
    countArticles: count,
    articles: Array.from({ length: count }, () => {
      const suppIdx = faker.number.int({ min: 0, max: SUPPLIERS.length - 1 });
      const suppId = suppIdx + 1;
      const hash = faker.string.hexadecimal({ length: 40, casing: 'lower' }).slice(2);
      return {
        articleId: faker.number.int({ min: 1000000, max: 99999999 }),
        articleNo: faker.string.alphanumeric({ length: 8, casing: 'upper' }),
        supplierName: SUPPLIERS[suppIdx],
        supplierId: suppId,
        articleProductName: productName,
        productId: productId,
        articleMediaType: pickOne(MEDIA_TYPES),
        articleMediaFileName: `${hash}.webp`,
        s3image: `https://fsn1.your-objectstorage.com/tecdoc2025/media_files/images/${suppId}/${hash}.webp`,
      };
    }),
  };
}

function genArticleMedia(articleId) {
  const count = faker.number.int({ min: 2, max: 6 });
  const suppId = faker.number.int({ min: 1, max: 100 });
  return Array.from({ length: count }, () => {
    const hash = faker.string.hexadecimal({ length: 40, casing: 'lower' }).slice(2);
    return {
      articleMediaType: pickOne(MEDIA_TYPES),
      articleMediaFileName: `${hash}.webp`,
      supplierId: suppId,
      mediaInformation: pickOne(MEDIA_INFO),
      s3image: `https://fsn1.your-objectstorage.com/tecdoc2025/media_files/images/${suppId}/${hash}.webp`,
    };
  });
}

function genArticleDetails(articleId, typeId) {
  const suppIdx = faker.number.int({ min: 0, max: SUPPLIERS.length - 1 });
  const suppId = suppIdx + 1;
  const suppName = SUPPLIERS[suppIdx];
  const partName = pickOne(PART_NAMES);
  const hash = faker.string.hexadecimal({ length: 40, casing: 'lower' }).slice(2);
  const id = Number(articleId) || faker.number.int({ min: 1000000, max: 99999999 });

  const specs = pick(CRITERIA_NAMES, faker.number.int({ min: 3, max: 7 })).map(name => ({
    criteriaName: name,
    criteriaValue: String(faker.number.int({ min: 1, max: 500 })),
  }));

  const mfr = pickOne(MANUFACTURERS);
  const compatCount = faker.number.int({ min: 2, max: 10 });
  const modelId = faker.number.int({ min: 1000, max: 9999 });
  const compatibleCars = Array.from({ length: compatCount }, () => {
    const sy = faker.number.int({ min: 1998, max: 2018 });
    const ey = faker.number.int({ min: sy + 1, max: 2025 });
    const cc = pickOne([1.0, 1.4, 1.6, 1.8, 2.0, 2.5, 3.0]);
    return {
      vehicleId: faker.number.int({ min: 1000, max: 200000 }),
      modelId,
      manufacturerName: mfr,
      modelName: `${mfr} ${faker.string.alpha({ length: 3, casing: 'upper' })} ${pickOne(BODY_TYPES)}`,
      typeEngineName: `${cc.toFixed(1)} ${pickOne(['TDI', 'TSI', 'CVVT', 'TFSI', 'HDi'])}`,
      constructionIntervalStart: `${sy}-0${faker.number.int({ min: 1, max: 9 })}-01`,
      constructionIntervalEnd: `${ey}-${String(faker.number.int({ min: 1, max: 12 })).padStart(2, '0')}-01`,
    };
  });

  return {
    article: {
      articleId: id,
      articleNo: faker.string.alphanumeric({ length: 7, casing: 'upper' }),
      articleProductName: partName,
      supplierName: suppName,
      supplierId: suppId,
      articleMediaType: pickOne(MEDIA_TYPES),
      articleMediaFileName: `${hash}.webp`,
      articleInfo: {
        articleId: id,
        articleNo: faker.string.alphanumeric({ length: 7, casing: 'upper' }),
        supplierId: suppId,
        supplierName: suppName,
        isAccessory: faker.number.int({ min: 0, max: 1 }),
        articleProductName: partName,
      },
      allSpecifications: specs,
      eanNo: { eanNumbers: String(faker.number.int({ min: 1000000000000, max: 9999999999999 })) },
      oemNo: Array.from({ length: faker.number.int({ min: 1, max: 4 }) }, () => ({
        oemBrand: pickOne(MANUFACTURERS),
        oemDisplayNo: `${faker.string.alpha({ length: 5, casing: 'upper' })}-${faker.string.alphanumeric({ length: 5, casing: 'upper' })}`,
      })),
      s3image: `https://fsn1.your-objectstorage.com/tecdoc2025/media_files/images/${suppId}/${hash}.webp`,
      compatibleCars,
    },
  };
}

function genSpareParts(params) {
  const articleIds = Array.from(
    { length: faker.number.int({ min: 2, max: 8 }) },
    () => faker.number.int({ min: 1000000, max: 99999999 })
  );
  const criteria = pick(CRITERIA_NAMES, faker.number.int({ min: 4, max: 8 }));
  const articles = [];
  articleIds.forEach(articleId => {
    criteria.forEach(name => {
      articles.push({
        articleId,
        criteriaName: name,
        criteriaValue: String(faker.number.int({ min: 1, max: 600 })),
        type: pickOne(CRITERIA_TYPES),
      });
    });
  });
  return { countArticles: articles.length, articles };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// 1. Vehicle Types (static domain data, never changes)
app.get('/types/list-vehicles-type', (req, res) => {
  res.json(genVehicleTypes());
});

// 2. Manufacturer IDs by Type ID  → different typeId = different set
app.get('/manufacturers/list/type-id/:typeId', (req, res) => {
  seedFromRequest(req);
  res.json(genManufacturers(req.params.typeId));
});

// 3. Models by Type & Manufacturer  → different manufacturerId = different models
app.get(
  '/models/list/type-id/:typeId/manufacturer-id/:manufacturerId/lang-id/:langId/country-filter-id/:countryFilterId',
  (req, res) => {
    seedFromRequest(req);
    res.json(genModels(req.params));
  }
);

// 4. Engine Types by Model  → different modelId = different engines
app.get(
  '/types/type-id/:typeId/list-vehicles-types/:modelId/lang-id/:langId/country-filter-id/:countryFilterId',
  (req, res) => {
    seedFromRequest(req);
    res.json(genEngineTypes(req.params));
  }
);

// 5. Categories by Vehicle ID v3  → different vehicleId = different category tree
app.get(
  '/category/type-id/:typeId/products-groups-variant-3/:vehicleId/lang-id/:langId',
  (req, res) => {
    seedFromRequest(req);
    res.json(genCategories(req.params));
  }
);

// 6. All Product Names  → langId-aware (deterministic but same shape always)
app.get('/category/list-products-names/lang-id/:langId', (req, res) => {
  seedFromRequest(req);
  res.json(genProductNames(req.params));
});

// 7. All Suppliers (static-ish pool, seeded for consistent ordering per request)
app.get('/suppliers/list', (req, res) => {
  res.json(genSuppliers());
});

// 8. Article List by Vehicle + Category  → vehicleId + categoryId combo drives the data
app.get(
  '/articles/list/type-id/:typeId/vehicle-id/:vehicleId/category-id/:categoryId/lang-id/:langId',
  (req, res) => {
    seedFromRequest(req);
    res.json(genArticleList(req.params));
  }
);

// 9. Article All Media  → articleId (query param) drives the images
app.get('/articles/article-all-media-info', (req, res) => {
  seedFromRequest(req);  // seeds from ?articleId=&langId=
  res.json(genArticleMedia(req.query.articleId));
});

// 10. Article Complete Details  → articleId (query param) drives everything
app.get('/articles/article-complete-details/type-id/:typeId', (req, res) => {
  seedFromRequest(req);  // seeds from path + ?articleId=...
  res.json(genArticleDetails(req.query.articleId, req.params.typeId));
});

// 11. Vehicle Spare Part Criteria  → supplierId + vehicleId + productId all matter
app.get(
  '/articles/selection-of-the-criteria-for-articles-and-vehicle/type-id/:typeId/product-id/:productId/vehicle-id/:vehicleId/supplier-id/:supplierId/lang-id/:langId/country-filter-id/:countryFilterId',
  (req, res) => {
    seedFromRequest(req);
    res.json(genSpareParts(req.params));
  }
);

// 12. Languages (static lookup table)
app.get('/languages', (_req, res) => res.json(LANG_ISO));
app.get('/lang', (_req, res) => res.json(LANG_ISO));

// ─── Catch-all ────────────────────────────────────────────────────────────────
app.use((req, res) => {
  const routes = app._router.stack
    .filter(r => r.route)
    .map(r => `${Object.keys(r.route.methods)[0].toUpperCase().padEnd(6)} ${r.route.path}`);
  res.status(404).json({
    error: `No route for: ${req.method} ${req.path}`,
    available: routes,
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🔌 Fixture server running on : http://localhost:${PORT}`);
});
