# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
pnpm dev              # serveur de developpement, http://localhost:3000
pnpm build            # build de production
pnpm lint             # eslint
npx tsc --noEmit      # verification de types, la vraie barriere du projet

pnpm db:generate      # genere une migration depuis lib/db/schema.ts
pnpm db:migrate       # applique les migrations sur data/app.db
npx drizzle-kit studio # inspection de la base

pnpm auth:user list                                   # comptes existants
pnpm auth:user create <login> --password "..."        # creer un compte
```

Aucun test et aucun lanceur de test ne sont installes. `npx tsc --noEmit` et
`pnpm lint` sont les seules verifications automatiques : les lancer avant de
committer. Deux erreurs eslint preexistent, des apostrophes non echappees dans
`parts-grid.tsx` et `vehicle-cascade.tsx`.

Le proprietaire lance lui-meme les serveurs et juge lui-meme les rendus visuels.
Ne pas demarrer `pnpm dev` en tache de fond, ne pas conclure sur une capture.

## Ce que fait l'application

Catalogue de pieces de freinage pour les franchises Jumbo Pneus. Un franchise
identifie un vehicule, l'application affiche les plaquettes et disques
compatibles avec leurs caracteristiques techniques.

Perimetre volontairement etroit, fixe dans `lib/config.ts` : deux categories
TecDoc (100030 plaquettes, 100032 disques) et cinq equipementiers.

## La contrainte qui explique l'architecture

RapidAPI est facture a l'appel avec un quota mensuel. Presque toutes les
decisions structurantes existent pour ne pas payer deux fois la meme
information. Sans cette cle de lecture le design parait arbitraire.

Consequence : la base n'est pas un cache, c'est le referentiel. Tout ce qui a
ete paye une fois y reste et se sert gratuitement ensuite.

## Le flux

```
  Cascade                                        Plaque
    |                                              |
  GET /api/vehicle/manufacturers                 POST /api/vehicle/by-plate
    |  698 constructeurs, 1 appel                  |  Exadis rend un K-Type
  GET /api/vehicle/models                          |  qui est deja le vehicleId
    |  ~130 modeles, 1 appel par constructeur      |  0 appel si deja connu,
  GET /api/vehicle/engine-types                    |  sinon la 1re categorie
    |  ~20 vehicules complets, 1 appel par modele  |  est acquise ici
    |                                              |
    +----------------------+-----------------------+
                           |
  vehicleId (= K-Type TecDoc, pivot de toute l'application)
    |
  GET /api/parts?vehicleId&categoryId
    |  declenche l'acquisition si le couple n'a jamais ete interroge
    |  liste d'articles + criteres, ~5 appels par categorie
    v
  les pieces
```

Il n'y a plus d'etape de synchronisation explicite : la lecture declenche
l'acquisition. Toute route ou hook qui parlerait de "sync" est obsolete.

## Les trois couches

**`lib/db/queries/`** lit la base, jamais le reseau. Un resultat vide veut dire
"pas encore acquis", ce que `isCategorySynced` permet de distinguer de
"aucune piece".

**`lib/acquisition/`** enveloppe ces lectures : base d'abord, appel RapidAPI
seulement si absent, ecriture, puis relecture. Les ecritures sont dans une
transaction. L'appel reseau reste toujours **avant** la transaction, le driver
`better-sqlite3` refusant un callback qui rend une promesse.

**`app/api/`** ne fait que du HTTP : garde d'auth, validation, delegation. Une
route type tient en vingt lignes de guard clauses et un `catch` d'une ligne.

## Acquisition dans les deux sens

La compatibilite piece/vehicule s'acquiert des deux cotes, et c'est le fait le
plus important du projet.

Par vehicule, `listArticles` coute un appel et rend une centaine d'articles pour
ce vehicule. Le cout suit la taille du parc, qui est illimitee.

Par article, `getArticleDetails` coute un appel et rend une centaine de
**vehicules compatibles** d'un coup. Le cout suit la taille du catalogue, qui
est bornee a deux categories et cinq marques.

Les deux tournent ensemble : a la demande pour que l'application marche tout de
suite, enrichi par chaque fiche article ouverte. Les vehicules compatibles sont
rattaches a la categorie ou la reference a ete decouverte, une plaquette restant
une plaquette.

Une fiche venue de la cascade porte 16 champs, une fiche apprise par
compatibilite seulement 7. La cascade ecrase donc la seconde, jamais l'inverse.

## Les caracteristiques techniques ont deux sources

`getSparePartCriteria(productId, vehicleId, supplierId)` est contextuel au
vehicule, porte un `type` (MANDATORY / OPTIONAL / ONLY_ARTICLE) et couvre tous
les articles du couple en un appel. C'est lui qui alimente les cartes et la
facette "Cote d'assemblage".

`getArticleDetails.allSpecifications` est la fiche technique generique de
l'article, sans type et plus maigre.

Les deux ne doivent jamais se melanger dans `article_criteria` : `getArticleDetail`
n'ecrit `allSpecifications` que si l'article n'a pas deja de criteres de vehicule.

## La plaque

`POST /api/vehicle/by-plate` traduit une immatriculation en `vehicleId` :

    plaque -> Exadis -> K-Type -> `vehicles` -> vehicleId

Exadis est du GWT-RPC scrape (`lib/suppliers/exadis/`), pas une API : les corps
de requete de `templates.ts` sont des captures a recopier au caractere pres, et
`transport.ts` passe par `node:https` pour fournir l'intermediaire de certificat
que leur serveur omet, plutot que de couper la verification TLS du process.
Seul le K-Type vient du fournisseur, jamais un prix ni un article.

Le K-Type est le `vehicleId` TecDoc, verifie sur une 307 dont Exadis rend 15901,
que `articles/list` sert directement. La plaque court-circuite donc entierement
la cascade, et coute moins qu'elle, qui depense trois appels avant les pieces.

Ce qui manque n'est pas les pieces mais la fiche vehicule : aucun endpoint ne la
rend depuis un `vehicleId` seul, les motorisations ne venant que de
`Engine_Types_by_Model`, qui exige un `modelId`. Elle est donc composee avec les
libelles d'Exadis, dans `lib/acquisition/plate.ts`.

`by-plate` a trois issues, dont deux sont des succes : le vehicule quand TecDoc
connait le K-Type, sinon une suggestion qui place la cascade sur la bonne marque
et le bon modele, et un 404 seulement quand Exadis lui-meme ignore la plaque.

Le rapprochement des libelles est dans `lib/vehicle/label-match.ts`, herite du
resolver parque mais avec la regle inversee : un seul candidat au meilleur
palier, sinon rien. Le resolver classait plusieurs candidats parce que le cout
des appels tranchait ensuite ; ici personne ne tranche derriere, et un
preremplissage plausible et faux ne serait jamais verifie. Mesure sur PRIUS,
dont sept modeles TecDoc commencent par ce mot : seule la marque est placee.

Cette fiche n'est ecrite que si la premiere categorie ramene des articles.
L'identifiant d'un fournisseur n'est pas toujours un K-Type, et une fiche
inventee resterait au referentiel sans jamais porter de piece. Mesure sur le
31134 d'une PRIUS : un appel, aucune ligne ecrite, retour a la cascade. La
preuve ne coute rien de plus, c'est l'appel que la categorie aurait paye.

`listArticles` rend `articles: null`, et non pas un tableau vide, sur un
`vehicleId` inconnu.

La traduction plaque vers K-Type n'est pas bancarisee : chaque recherche repasse
par le portail. La session Exadis, elle, est mutualisee par processus.

## Conventions

**Erreurs.** `RapidApiError` dans `lib/rapidapi/errors.ts`, avec son code decide
la ou l'information existe. Ne jamais reconstruire une cause en relisant
`error.message`. Une route fait `return rapidApiFailure(error, { ... })`.
Ne pas annoter `catch (error: unknown)` : avec `strict` TypeScript le fait deja.

**Logs.** `logger` de `lib/logger.ts`, jamais `console`. Chaque route est
enveloppee dans `withRequestContext("nom/route", ...)`, qui pose `requestId` et
`route` sur toutes les lignes : inutile de repasser la route dans le contexte.

**Configuration.** Tout ce qui touche RapidAPI passe par `lib/config.ts`.
`LANG_ID`, `COUNTRY_FILTER_ID` et `TYPE_ID` y sont des constantes en dur, pas
des variables d'environnement : les relire depuis `process.env` produit des URL
contenant `undefined`, ce qui est deja arrive.

**Langue.** Identifiants et noms de fichiers en anglais, docstrings et
commentaires en francais, messages utilisateur en francais. Commentaires courts
et de haut niveau, pas de gros blocs.

**Couleurs.** Palette Jumbo Pneus dans `app/globals.css`. `pine` est la couleur
d'identite et d'action, `ink` le texte courant. Ne pas repeindre le texte en
vert. L'or `gold` ne recoit que du texte sombre, le blanc dessus tombe a 1,83:1.
`sky`, `flame`, `leaf` sont des etats d'administration et `plate-blue`,
`plate-star` la bande europeenne reglementaire : ces cinq la ne suivent pas la
charte.

## Ce qui est parque

`parked/` est exclu du `tsconfig`, donc jamais compile.

`parked/plate/ktype-resolver.ts` est ce qui reste de la recherche par plaque :
la remontee par libelles, qui retrouve le vrai K-Type quand le fournisseur en
rend un autre. Mesure sur une TOYOTA PRIUS III, dont Exadis annonce 31134 alors
que son libelle moteur nomme le K-Type 115456. Reportee parce qu'elle marche a
coups d'appels RapidAPI sur les vehicules inconnus, alors que la voie courte
n'en depense aucun.

`parked/normalize.ts` contient les regles de normalisation marque/reference pour
raccrocher des offres grossistes, donnees comme eprouvees en production. Hors
perimetre tant qu'il n'y a pas de prix.

## Dette connue

`lib/api/shapes.ts` traduit les lignes de base vers l'ancien vocabulaire TecDoc
que l'interface consomme encore (`articleProductName`, `s3image`, `specs`). Cette
couche existe pour avoir evite de renommer quatre-vingts references pendant la
refonte du schema. A supprimer le jour ou les composants passeront aux noms du
schema.

La table `vehicle_selections` est alimentee mais jamais lue : c'est toujours
`localStorage` qui restitue le vehicule courant. Choix assume, la persistance
multi-poste n'etant pas demandee.

Aucun test. Les cibles evidentes sont le filtrage par equipementier, le
regroupement des criteres, la priorite entre les deux sources de
caracteristiques, et l'idempotence de l'acquisition.
