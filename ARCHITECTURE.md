# Grille de lecture

Document d'entrée pour reprendre le dépôt. Il décrit ce qui est, pas ce qui devrait être.

## Ce que fait l'application

Catalogue de pièces de freinage pour des franchisés. L'utilisateur identifie un véhicule, l'application affiche les plaquettes et les disques compatibles, avec leurs fiches techniques.

Deux catégories TecDoc seulement, en dur dans `lib/config.ts` : 100030 plaquettes, 100032 disques. Cinq équipementiers autorisés. Ce n'est pas un catalogue généraliste et l'architecture en dépend.

## La contrainte qui explique tout le reste

RapidAPI est facturé à l'appel, avec un quota mensuel. Presque toutes les décisions structurantes du code existent pour ne pas payer deux fois la même information.

C'est la clé de lecture. Tant qu'on ne l'a pas, le design paraît arbitraire. Une fois qu'on l'a, les pièces s'expliquent seules :

- `api_cache` n'a pas d'expiration, parce qu'une réponse de référentiel ne change pas.
- `lib/vehicle/vehicle-index.ts` existe parce que l'appel qui donne une motorisation en donne vingt : on garde les dix-neuf autres.
- Les tables `td_*` sont un catalogue acheté une fois puis servi gratuitement.
- `scripts/night-run.ts` fait payer la nuit ce que la journée servira gratuitement.
- `ALLOWED_SUPPLIER_IDS` est décrit dans `config.ts` comme le levier de coût le plus direct.

## Le flux principal

Tout converge vers un `vehicleId` TecDoc. Deux chemins pour l'obtenir.

```
  Plaque                            Cascade manuelle
    |                                   |
  POST /api/vehicle/by-plate        GET /api/vehicle/manufacturers
    |                                   |  puis /models
  lib/plate/identify.ts                 |  puis /engine-types
    |  (Exadis -> K-Type)               |
  lib/vehicle/ktype-resolver.ts         |
    |  (index local, sinon RapidAPI)    |
    +---------------+-------------------+
                    |
                vehicleId
                    |
        POST /api/vehicle/sync
                    |
        lib/vehicle/sync-service.ts
                    |  (RapidAPI -> SQLite)
            tables vehicles, articles, suppliers
                    |
        GET /api/parts  ->  l'interface
```

Le point important : `by-plate` n'achète aucune pièce. Il ne fait qu'identifier. C'est `sync` qui dépense, et le client l'appelle en second.

## Les couches

| Dossier | Rôle | Règle |
| --- | --- | --- |
| `app/api/**` | HTTP uniquement | Garde d'auth, validation, délégation, réponse. Aucune logique métier. |
| `app/(app)/**` | Pages rendues | Serveur par défaut, `"use client"` seulement quand il y a de l'état. |
| `components/**` | React | `ui/` et `reui/` sont des primitives, le reste est métier. |
| `lib/**` | Toute la logique | Ne connaît pas HTTP, sauf `lib/rapidapi/errors.ts` qui fabrique la réponse d'erreur. |
| `scripts/**` | Batch | Lancés par `tsx --env-file=.env`, hors serveur Next. |
| `drizzle/**` | Migrations | Générées, jamais éditées à la main. |

Une route typique tient en vingt lignes et ne contient que des guard clauses :

```ts
const auth = await requireUser();
if (auth instanceof NextResponse) return auth;

const modelId = Number(new URL(request.url).searchParams.get("modelId"));
if (!modelId) return NextResponse.json({ error: "modelId requis" }, { status: 400 });

try {
    return NextResponse.json(await getWithCache(...));
} catch (error) {
    return rapidApiFailure(error, { modelId });
}
```

Si une route commence à faire autre chose que ça, la logique est au mauvais endroit.

## Ordre de lecture conseillé

Six fichiers suffisent pour comprendre le dépôt. Dans cet ordre :

`lib/config.ts` pour les constantes métier, dix minutes bien investies.

`lib/db/schema.ts` parce que le modèle de données dicte le reste, et parce que ses commentaires expliquent le pourquoi de chaque table.

`app/api/vehicle/by-plate/route.ts` comme exemple de route bien tenue, courte et documentée sur ses décisions.

`lib/vehicle/ktype-resolver.ts` qui est le vrai cœur métier : comment on retrouve un véhicule quand l'identifiant du fournisseur n'est pas celui du référentiel.

`lib/vehicle/sync-service.ts` pour la dépense, c'est-à-dire ce qui appelle RapidAPI et remplit SQLite.

`lib/rapidapi/client.ts` pour voir toutes les sorties réseau au même endroit.

Les gros fichiers d'interface (`components/vehicle/vehicle-cascade.tsx`, `app/(app)/logs/log-viewer.tsx`) peuvent attendre : ils sont volumineux mais sans surprise.

## Le stockage

SQLite via Drizzle, fichier `data/app.db`, chemin dans `SQLITE_PATH`.

Deux familles de tables cohabitent.

La famille applicative sert l'interface aujourd'hui. `vehicles`, `articles`, `article_specifications`, `suppliers`, `categories`. Un article y est dupliqué pour chaque couple véhicule/catégorie où il apparaît. C'est ce que lit `GET /api/parts`.

La famille `td_*` est un modèle normalisé plus récent : `td_article` stocke une référence une seule fois, `td_fitment` porte la compatibilité en table de liaison, `td_criteria`, `td_oem` et `td_wva` portent les équivalences. Elle est alimentée par `lib/catalog/indexer.ts` via `pnpm index:braking`.

À vérifier avant de vous appuyer dessus : hors `td_vehicle`, que lit `vehicle-index.ts` pour l'index K-Type, aucune route ni aucun composant ne lit les tables `td_*`. Elles sont écrites et pas encore servies. La migration semble commencée et non terminée.

`api_cache` est transverse et sans expiration, en JSON brut ou gzippé selon la fonction utilisée.

## Conventions à respecter

**Erreurs.** Deux types, même forme, chacun dans son module : `PlateLookupError` dans `lib/plate/errors.ts`, `RapidApiError` dans `lib/rapidapi/errors.ts`. Le code d'erreur est décidé là où l'information existe, jamais reconstruit en relisant `error.message`. Une route ne fait que `return rapidApiFailure(error, { ... })`.

Ne pas annoter `catch (error: unknown)` : avec `strict`, TypeScript le fait déjà.

**Logs.** `logger` de `lib/logger.ts`, jamais `console`. Chaque route est enveloppée dans `withRequestContext("nom/route", ...)`, qui pose `requestId` et `route` sur toutes les lignes de log de la requête. Inutile donc de repasser la route dans le contexte. Sortie JSON dans `logs/app-AAAA-MM-JJ.log`, relue par `/logs`.

**Cache.** `getWithCache` pour du JSON normal, `getWithCompressedCache` pour les gros objets comme les fiches article. Même contrat, même clé.

**Auth.** `requireUser()` en première ligne de chaque route protégée. Sessions maison : le cookie porte un token, la table `sessions` en stocke le SHA-256, ce qui rend la révocation immédiate. Les pages `/logs` et `/comptes` ont en plus un verrou par mot de passe construit avec `createGate` de `lib/auth/gate.ts`.

**Langue.** Noms de code et docstrings en anglais, commentaires en ligne en français, messages destinés à l'utilisateur en français.

## Où toucher quoi

| Besoin | Fichier |
| --- | --- |
| Ajouter une catégorie ou un équipementier | `lib/config.ts` et `.env` |
| Changer un message d'erreur utilisateur | `lib/plate/errors.ts` ou `lib/rapidapi/errors.ts` |
| Ajouter un appel RapidAPI | `lib/rapidapi/client.ts`, objet `rapidApi` |
| Modifier ce qui est stocké à la synchro | `lib/vehicle/sync-service.ts` |
| Changer la reconnaissance d'un véhicule | `lib/vehicle/ktype-resolver.ts` |
| Changer une table | `lib/db/schema.ts` puis `pnpm db:generate` et `pnpm db:migrate` |
| Ajouter un fournisseur de plaque | `lib/suppliers/`, en respectant `PlateLookupError` |

## À savoir avant de modifier

Il n'y a aucun test et aucun lanceur de test installé. La seule barrière automatique est `npx tsc --noEmit` et `pnpm lint`. Lancez les deux avant de committer.

`tsconfig.json` est en `strict`, et il n'y a plus aucun `any` dans le code applicatif. Ne pas rouvrir la porte.

Les scripts tournent hors Next et ont besoin de `--env-file=.env`, ce que font déjà les entrées de `package.json`.

`LANG_ID`, `COUNTRY_FILTER_ID` et `TYPE_ID` ne sont pas des variables d'environnement. Ce sont des constantes de `lib/config.ts`, et c'est de là que `lib/rapidapi/client.ts` les prend. Ne pas les redéclarer en lisant `process.env` : elles n'existent pas dans `.env`, elles valaient `undefined` et partaient telles quelles dans les URL appelées.

Plus généralement, tout ce qui touche RapidAPI passe par `lib/config.ts`. Les autres modules lisent encore `process.env` en direct pour leurs propres réglages, Exadis, sessions, chemin SQLite, ce qui reste acceptable tant que la variable existe dans `.env` avec un repli.
