# Catalogue pièces frein (frein.jumbopneus.pro) — Modifications à réaliser

**Version :** 2.0 — remplace le *Cahier de modifications v1.0* et son *Supplément v1.1*
**Date :** 9 septembre 2026
**Objet :** liste consolidée des points **restant à traiter**. Les demandes déjà livrées ont été retirées de ce document.
**Conditions des constats :** poste redémarré, cache et cookies vidés, session neuve, compte `admin2`, navigateur desktop. Véhicules de test : `vehicule=57281` (RENAULT CLIO IV (BH_) 1.5 dCi 90), `vehicule=135335` (RENAULT CLIO IV (BH_) 1.5 dCi BHM6). Chaque constat a été reproduit sur au moins deux sessions distinctes.

---

## 1. Tableau de synthèse

| ID | Intitulé | Type | Priorité |
|----|----------|------|----------|
| R1 | « Effacer le véhicule » sans effet — impossible de changer de véhicule | Régression | **P0** |
| R2 | Recherche par référence : tri inversé, résultats parasites, EAN non indexé | Anomalie | **P1** |
| C1 | Optimisation des images — à terminer | Performance | **P1** |
| E1 | Remplacer le mot de passe d'administration partagé par des rôles | Sécurité | **P1** |
| E3 | Rotation des identifiants | Sécurité | **P1** |
| R3 | Emplacement du champ de recherche par référence | Ergonomie | P2 |
| D1 | Limiter les listes à la couverture réelle du catalogue | Ergonomie | P2 |
| D3 | Pagination : valeur par défaut et options | Ergonomie | P2 |
| D6 | Validation et normalisation de la saisie d'immatriculation | Ergonomie | P2 |
| F1 | Cache HTTP sur les données de référence TecDoc | Architecture | P2 |
| D2 | Largeur et lisibilité des listes déroulantes | Ergonomie | P3 |
| D5 | Fusion des attributs à valeurs multiples | Ergonomie | P3 |
| F2 | Regrouper les appels `/api/parts` par catégorie | Architecture | P3 |
| F3 | Préparer la pagination et le filtrage côté serveur | Architecture | P3 |

**Dépendance :** R1 bloque le contrôle de D2 et D6 — l'écran d'identification n'est plus atteignable. Traiter R1 en premier.

---

## 2. R1 — « Effacer le véhicule » sans effet (P0)

### Constat

Sur une session neuve, véhicule `135335` sélectionné, le clic sur **Effacer le véhicule** produit la séquence suivante :

1. l'URL passe à `/` ;
2. `GET /api/vehicle/manufacturers` est émis — le formulaire d'identification commence à se monter ;
3. `GET /api/vehicle/135335` est émis immédiatement après — le véhicule est relu et réaffiché ;
4. **aucun appel `DELETE` ni `PUT` n'est émis vers `/api/vehicle/selection`** ;
5. le champ de saisie d'immatriculation n'apparaît jamais.

Un rechargement de `https://frein.jumbopneus.pro/` redirige systématiquement vers `?vehicule={id}`.

### Analyse

La sélection stockée côté session serveur n'est jamais supprimée. L'état client est bien réinitialisé, mais un effet consécutif relit la sélection depuis le serveur et la réapplique.

Régression vraisemblablement liée à la correction du libellé véhicule : celui-ci est désormais résolu via `GET /api/vehicle/{id}` à partir de la sélection de session, alors que l'action d'effacement ne notifie plus le serveur.

### Impact

Un franchisé ayant sélectionné un véhicule **ne peut plus revenir à l'écran d'identification**, donc ne peut plus rechercher par immatriculation ni par modèle. Le seul contournement est la modification manuelle du paramètre `?vehicule=` dans la barre d'adresse — inutilisable au comptoir.

### Attendu

- Le clic sur **Effacer le véhicule** supprime la sélection **côté serveur** (appel explicite de suppression sur `/api/vehicle/selection`) avant de rendre l'écran d'identification.
- Aucune relecture de la sélection ne doit intervenir après l'effacement.
- Après effacement, un rechargement de `/` affiche l'écran d'identification et ne redirige pas vers `?vehicule={id}`.

### Critères d'acceptation

- Après clic : l'URL est `/`, le champ d'immatriculation et les trois listes déroulantes sont affichés, aucun bandeau véhicule n'est présent.
- Un rechargement complet confirme l'état effacé.
- Le scénario complet est rejouable — sélectionner un véhicule → effacer → sélectionner un autre véhicule — sans intervention sur l'URL.

---

## 3. R2 — Recherche par référence : tri inversé et résultats parasites (P1)

Le paramètre `q` est bien exploité, mais le résultat pertinent est classé en dernière position, derrière des articles qui remontent pour n'importe quelle requête.

### Constat 1 — le résultat pertinent est toujours le dernier

Requête `EP1466` (référence ETF), en faisant varier `limit` :

| `limit` | Position de `ETF:EP1466` dans la réponse |
|---------|------------------------------------------|
| 5 | 5ᵉ (dernière) |
| 10 | 10ᵉ (dernière) |
| 15 | 15ᵉ (dernière) |
| 50 | 50ᵉ (dernière) |

Le résultat pertinent occupe systématiquement la dernière place, quelle que soit la taille de la réponse : **le sens du tri par pertinence est inversé** (tri ascendant appliqué là où un tri descendant est attendu).

### Constat 2 — un lot d'articles remonte pour toute requête

L'interface appelle `GET /api/parts/search?q={terme}&limit=15`. Résultats observés :

| Requête | 15ᵉ résultat (dernier) | 14 premiers résultats |
|---------|------------------------|------------------------|
| `EP1466` (réf. ETF) | **ETF:EP1466** ✔ | lot constant d'articles BOSCH |
| `22525` (n° WVA) | **TEXTAR:2252501** ✔ | idem |
| `302150` (réf. VALEO) | **VALEO:302150** ✔ | idem |
| `2445101` (réf. TEXTAR) | **TEXTAR:2445101SC** ✔ | idem |
| `4047026182927` (EAN) | BOSCH:0 986 494 428 ✘ | idem |
| `ZZZZZZ999` (chaîne inexistante) | BOSCH:0 986 494 428 | idem |

Une requête sans correspondance possible (`ZZZZZZ999`) renvoie malgré tout un jeu constant de 50 articles maximum, toujours les mêmes et dans le même ordre.

**Piste à vérifier :** une des branches de la condition de correspondance a probablement ses opérandes inversés — par exemple `q LIKE '%' + oe + '%'` au lieu de `oe LIKE '%' + q + '%'`. Lorsque le champ OE est vide ou nul, la condition devient toujours vraie et l'article remonte quelle que soit la requête. Les deux constats proviennent vraisemblablement du même bloc de code.

### Constat 3 — le code EAN n'est pas indexé

La requête `4047026182927` renvoie exactement le même jeu de résultats qu'une chaîne inexistante, alors que ce code EAN figure explicitement sur la fiche `/piece/61394` (BOSCH `0 986 424 021`). Le texte d'invite du champ annonce pourtant « Rechercher une référence, EAN, OE… ».

### Attendu

1. **Rétablir le sens du tri par pertinence** : les correspondances les plus fortes en tête.
2. **Supprimer les résultats parasites** : une requête sans correspondance renvoie un jeu vide et déclenche l'état « aucun résultat ».
3. **Ordre de pertinence explicite**, du plus fort au plus faible :
   1. égalité stricte sur la référence fabricant, l'EAN, le numéro WVA ou le numéro OE (après normalisation) ;
   2. correspondance en début de chaîne ;
   3. correspondance partielle.

   À score égal, les articles ETF passent devant.
4. **Indexer le code EAN**, ainsi que le numéro WVA et le numéro OE si ce dernier est disponible dans la source TecDoc — ou retirer les mentions correspondantes du texte d'invite.
5. **Normalisation appliquée des deux côtés de la comparaison** : suppression des espaces, tirets et points, insensibilité à la casse.
6. La longueur minimale de 3 caractères déjà en place est conforme et doit être conservée.

### Critères d'acceptation

- `EP1466`, `22525`, `302150`, `2445101` et `4047026182927` placent chacun l'article correspondant en **première** position.
- `ZZZZZZ999` renvoie zéro résultat et affiche l'état « aucun résultat ».
- Le comportement est identique quelle que soit la valeur de `limit`.

---

## 4. C1 — Optimisation des images : à terminer (P1)

### Constat

La première partie de la demande est en place : format WebP, `loading="lazy"`, attributs `width`/`height`, texte alternatif renseigné.

Deux points restent ouverts :

- **`srcset` absent** sur l'ensemble des images.
- **Le redimensionnement n'a été appliqué qu'aux images ETF.** Celles du dossier `/media_files/images/7657/` font environ 566 px de large ; celles des fournisseurs TecDoc (`/media_files/images/30/` — BOSCH, VALEO, TRW, TEXTAR) sont toujours servies en **1280 × 914** dans un emplacement de 160 px. Ce sont ces images qui représentent l'essentiel du poids d'une page de liste.

### Attendu

1. **Étendre la génération de vignettes à l'ensemble du catalogue**, au moment de la synchronisation/ingestion TecDoc (et non à la volée) : deux largeurs, 200 px et 400 px, en WebP, stockées sur le stockage objet Hetzner à côté des originaux.
2. **Liste de pièces** : servir les vignettes via `srcset` / `sizes`.
3. **Fiche produit** : image d'origine conservée, chargée en `lazy` sauf l'image principale.
4. **Activer CORS et `Timing-Allow-Origin`** sur le stockage objet, afin de permettre la mesure des performances côté client (actuellement impossible).

### Critères d'acceptation

- Aucune image de liste ne dépasse 400 px de large en résolution native.
- Poids cumulé des images d'une page de liste (20 articles) inférieur à 300 Ko.
- LCP inférieur à 2,5 s sur connexion 4G simulée, CLS inférieur à 0,1.

---


## 7. R3 — Emplacement du champ de recherche par référence (P2)

### Constat

Sur l'écran d'identification du véhicule, deux points d'entrée sont présentés dans le bandeau vert, sur un pied d'égalité et séparés par un « OU » : **Recherche par plaque d'immatriculation** et **Recherche par modèle**. La recherche par référence est isolée dans l'en-tête, en gris clair, à l'écart du bloc principal.

C'est pourtant un point d'entrée de même nature et de même importance : au comptoir, le collaborateur a souvent la pièce usagée en main sans connaître le véhicule. Placée à l'écart et visuellement discrète, cette fonction sera peu utilisée.

### Attendu

**Sur l'écran d'identification (aucun véhicule sélectionné)** — intégrer la recherche par référence comme **troisième point d'entrée à l'intérieur du bandeau vert**, au même niveau visuel que les deux autres, séparée par un « OU » :

```
Recherche par plaque    OU    Recherche par modèle    OU    Recherche par référence
```

- Champ de saisie de même hauteur et de même traitement graphique que celui de l'immatriculation.
- Invite : « Référence, EAN, WVA ou OE ».
- Le champ alimente le même point d'API et affiche les mêmes résultats que le champ de l'en-tête.
- Si la largeur disponible ne permet pas trois colonnes lisibles, disposer la recherche par référence sur une seconde ligne **à l'intérieur du même bandeau**, plutôt que de la renvoyer dans l'en-tête.

**Sur toutes les autres pages** (véhicule sélectionné, fiche produit, page 404) — le champ de l'en-tête est conservé tel quel.

**Doublon :** sur l'écran d'identification, le champ de l'en-tête peut être masqué ou conservé — à trancher visuellement, mais les deux champs ne doivent en aucun cas afficher des invites ou des comportements différents.

### Critères d'acceptation

- Sur l'écran d'identification, les trois points d'entrée sont visibles sans défilement et présentent une hiérarchie visuelle équivalente.
- La saisie d'une référence depuis le bandeau vert donne le même résultat que depuis l'en-tête.
- La sélection d'un véhicule en cours n'est pas affectée par une recherche par référence.

---

## 8. D1 — Limiter les listes à la couverture réelle du catalogue (P2)

### Constat

`/api/vehicle/manufacturers` renvoie toujours **698 constructeurs**, dans le même ordre (212, ABARTH, AC, ACURA, ACURA (GAC), ADDAX, AEOLUS, AGRALE, AITO…), sans champ de regroupement — la réponse ne contient que `manufacturerId` et `manufacturerName`. Une grande majorité de ces constructeurs n'a aucune pièce dans le périmètre du catalogue (whitelist catégories `100030` plaquettes / `100032` disques ; whitelist marques ETF, TRW, BOSCH, VALEO, TEXTAR).

La liste *Modèle* pour RENAULT contient 213 entrées, triées alphanumériquement, commençant par des modèles de 1966 (`10 (119.)`, `11 (B/C37.)`, `12`). L'utilisateur peut donc parcourir trois niveaux de sélection pour aboutir à un résultat vide.

### Attendu

- Ne présenter que les constructeurs, modèles et motorisations pour lesquels **au moins une pièce du périmètre est disponible**, à partir d'une table de couverture précalculée depuis les liaisons TecDoc, rafraîchie à chaque mise à jour du référentiel.
- À défaut, si le précalcul n'est pas réalisable à court terme : introduire un groupe **« Constructeurs courants »** en tête de liste, suivi d'un séparateur puis du reste. Liste configurable côté administration ; valeur initiale proposée : RENAULT, PEUGEOT, CITROËN, DACIA, VOLKSWAGEN, TOYOTA, FORD, OPEL, BMW, MERCEDES-BENZ, AUDI, FIAT, NISSAN, SEAT, ŠKODA, HYUNDAI, KIA.
- Écarter les gammes hors périmètre (par exemple RENAULT TRUCKS) si aucune pièce n'y est associée.
- Le regroupement par type d'énergie déjà en place sur la liste *Motorisation* (Diesel / Essence) est conservé.

---

## 9. D3 — Pagination : valeur par défaut et options (P2)

### Constat

Toujours 10 éléments par page par défaut, options limitées à 5, 10 et 20, contrôles présents uniquement en bas de liste. Sur le véhicule `57281` (36 pièces), cela impose 4 pages.

### Attendu

- Valeur par défaut portée à **20**.
- Options : 20, 50, 100, **Tout afficher**.
- Choix mémorisé (stockage local) et réappliqué aux consultations suivantes.
- Contrôles de pagination affichés en haut **et** en bas de la liste.
- Le total reste visible (formulation actuelle « Page 1 sur 4 (36 pièces) » à conserver).

---

## 10. D6 — Validation et normalisation de la saisie d'immatriculation (P2)

> À contrôler après correction de R1 — l'écran d'identification n'est pas atteignable actuellement. Le comportement décrit ci-dessous a été constaté avant la livraison v1.0 et n'a pas pu être revérifié.

### Constat

La saisie de `XX` déclenche un appel `POST /api/vehicle/by-plate` (réponse 404) : aucune validation de format côté client, ce qui consomme inutilement des appels au service d'identification, facturés à la requête. Toutes les situations d'échec renvoient le même message : « Aucun véhicule trouvé pour cette immatriculation. »

### Attendu

1. **Validation côté client** des deux formats français avant tout appel : format SIV (`AA-123-BB`) et format FNI (`123 ABC 75`).
2. **Assistance à la saisie** : mise en majuscules automatique et insertion automatique des tirets pendant la frappe.
3. **Aucun appel réseau** si le format est invalide.
4. **Messages distincts** :
   - format invalide → « Format de plaque non reconnu. Exemples : AA-123-BB ou 123 ABC 75. »
   - réponse 404 → « Aucun véhicule trouvé pour cette immatriculation. »
   - erreur 5xx ou expiration du délai → « Le service d'identification est momentanément indisponible. Utilisez la recherche par modèle. »
5. **Mention des formats acceptés** sous le champ de saisie.
6. **Comptage des appels** au service d'identification, consultable dans l'espace d'administration.

---

## 11. F1 — Cache HTTP sur les données de référence TecDoc (P2)

### Constat

`/api/vehicle/manufacturers` ne renvoie **ni `Cache-Control` ni `ETag`**. Même situation pour `/api/vehicle/models` et `/api/vehicle/engine-types`. Ces données de référence sont pourtant quasi statiques entre deux mises à jour du référentiel.

### Attendu

- Sur les trois points d'API de référence : `Cache-Control: private, max-age=86400, stale-while-revalidate=604800` (valeurs à ajuster) et gestion d'`ETag`.
- Invalidation liée à la version du référentiel TecDoc : clé de version dans l'URL ou dans un en-tête, de sorte qu'une mise à jour du dump invalide immédiatement les caches.
- Sur `/api/parts` : cache court (5 à 15 minutes), à réévaluer lorsque les prix et stocks seront intégrés — ces données ne devront pas être mises en cache dans les mêmes conditions.
- Option complémentaire : mise en cache côté client (stockage local) de la liste des constructeurs, indexée par version du référentiel — cette liste de 698 entrées est rechargée à chaque session.

**Note.** Les temps de réponse mesurés sont bons (28 à 45 ms). Cette demande vise à réduire le nombre d'appels et la charge serveur, pas à corriger une lenteur.

---

## 12. D2 — Largeur et lisibilité des listes déroulantes (P3)

### Constat

Les champs de la recherche par modèle sont trop étroits : à l'état fermé, les libellés sont déjà tronqués (« D'abord un fabr… », « D'abord un mo… »). À l'ouverture, le panneau de la liste *Modèle* affiche les libellés longs sur quatre lignes, par exemple « 11 Camionnette/Berline bicorps trois ou cinq portes (S37_) (1983 – 1989) ». La lecture en balayage est très difficile.

### Attendu

- Largeur minimale du panneau déroulant portée à 380 px, indépendante de la largeur du champ fermé.
- Libellés limités à deux lignes maximum, avec troncature par points de suspension et libellé complet en infobulle (`title`).
- Les libellés d'état des champs fermés (« D'abord un fabricant », « D'abord un modèle ») doivent être lisibles en entier.
- Même traitement pour les listes *Fabricant* et *Motorisation*.

---

## 13. D5 — Fusion des attributs à valeurs multiples (P3)

### Constat

Sur la fiche `/piece/61394`, l'attribut « Article complémentaire / Info complémentaire 2 » occupe **trois lignes distinctes** (« avec clip de piston », « avec instructions de montage », « avec tôle anti-bruit ») et « Référence de l'accessoire recommandé » deux lignes. Dans la liste, ces attributs sont réduits à une mention peu informative du type « 2 valeurs › » ou « 3 valeurs › ».

### Attendu

- **Fiche produit** : une seule ligne par nom d'attribut, les valeurs multiples présentées sous forme de liste dans la cellule de droite.
- **Liste de pièces** : afficher les deux premières valeurs séparées par une virgule, suivies de « +n » si nécessaire, plutôt que le libellé « n valeurs ».

---

## 14. F2 — Regrouper les appels `/api/parts` par catégorie (P3)

### Constat

Avant la livraison v1.0, le chargement d'un véhicule déclenchait un appel par catégorie de la whitelist, en parallèle : `GET /api/parts?vehicleId={id}&categoryId=100030` et `…&categoryId=100032`. Les articles sont désormais chargés côté serveur, aucun appel client n'est plus observable — **l'état actuel de ce point est donc à confirmer dans le code.**

### Attendu

- Un seul appel acceptant plusieurs catégories : `/api/parts?vehicleId={id}&categoryIds=100030,100032`, renvoyant les articles regroupés par catégorie.
- Maintien temporaire de la signature actuelle pour compatibilité, avec date de retrait annoncée.

---

## 15. F3 — Préparer la pagination et le filtrage côté serveur (P3)

### Constat

Le filtrage et la pagination sont effectués côté client. Avec 36 pièces par véhicule, ce fonctionnement est adapté et procure une navigation instantanée.

### Attendu

**Ne rien modifier aujourd'hui**, mais concevoir l'API dans une optique de bascule : prévoir dès à présent les paramètres `page`, `pageSize`, `sort`, `brands`, `categoryIds` sur `/api/parts`, ainsi que le renvoi des compteurs de facettes calculés côté serveur.

**Seuil de bascule proposé :** passage effectif au filtrage et à la pagination côté serveur dès qu'un véhicule dépasse environ 200 pièces, ou dès l'ajout d'une troisième catégorie au périmètre.


