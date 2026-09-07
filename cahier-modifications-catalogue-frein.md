# Cahier de modifications — Catalogue pièces frein (frein.jumbopneus.pro)


## Anomalies

### Message d'état vide erroné (P1)

**Constat.** Sur le véhicule `57281`, en sélectionnant Catégorie = *Disques de frein* et Marque = *ETF*, l'application affiche :
> « Aucune pièce trouvée — Pas de disques de frein disponibles pour ce véhicule. »

Or 13 disques de frein sont bien référencés pour ce véhicule ; seule la combinaison avec la marque ETF est vide. Le message ignore les filtres marque et laisse croire au franchisé qu'aucun disque n'est disponible.

**Attendu.** Distinguer trois situations et afficher un message adapté à chacune :

1. Le véhicule n'a aucune pièce référencée dans le périmètre :
   > « Aucune pièce n'est référencée pour ce véhicule. »
2. La catégorie sélectionnée est vide, tous filtres marque désactivés :
   > « Aucun disque de frein n'est référencé pour ce véhicule. »
3. La combinaison de filtres actifs ne renvoie rien, alors que la catégorie contient des pièces :
   > « Aucune pièce ne correspond aux filtres sélectionnés. »
   > accompagné de deux actions : **Retirer le filtre marque** et **Réinitialiser tous les filtres**.

**Critères d'acceptation.**
- Le message du cas 2 n'apparaît jamais lorsque la catégorie seule contient au moins un résultat.
- Le cas 3 propose toujours au moins une action de retour à un état non vide.

---

### Compteurs de facettes non recalculés (P1)

**Constat.** Les compteurs affichés dans le panneau *Filtres* sont statiques et calculés sur l'ensemble des pièces du véhicule, sans tenir compte des autres filtres actifs. Sur le véhicule `57281`, après avoir coché *Disques de frein*, la facette Marques continue d'afficher : ETF 2, TRW 5, BOSCH 8, VALEO 14, TEXTAR 7 (soit les 36 pièces toutes catégories confondues), alors que seuls 13 articles sont concernés. Les options menant à zéro résultat restent cliquables.

**Attendu.** Mettre en place un comptage de facettes classique :

- Le compteur de chaque option d'une facette est calculé en appliquant **tous les filtres actifs des autres facettes**, mais pas ceux de la facette elle-même (comportement standard pour permettre la multi-sélection au sein d'une même facette).
- Toute option dont le compteur vaut 0 est affichée grisée, non cliquable, avec le compteur « 0 ».
- Les compteurs sont mis à jour à chaque changement de filtre, sans rechargement de page.

**Critères d'acceptation.**
- Sur le véhicule `57281` avec *Disques de frein* coché, la somme des compteurs de la facette Marques est égale à 13, et ETF affiche 0 en grisé.
- Aucune combinaison de filtres cliquable ne peut aboutir à un résultat vide.

---

## Fonctionnalités

### Recherche par référence (P1)

**Constat.** Le parcours actuel est unidirectionnel : identifier le véhicule, puis consulter les pièces. L'en-tête ne contient qu'un logo et le menu utilisateur. Le cas d'usage comptoir le plus fréquent — une pièce usagée en main, portant une référence — n'est pas couvert.

**Attendu.** Champ de recherche global, présent dans l'en-tête sur toutes les pages, indépendant de la sélection véhicule en cours.

**Types de références acceptés :**

| Type | Exemple observé | Source |
|------|-----------------|--------|
| Référence fabricant | `0 986 424 021` | champ RÉFÉRENCE de la fiche |
| Code EAN | `4047026182927` | champ CODE EAN de la fiche |
| Numéro WVA | `22525` | attribut « numéro WVA » |
| Numéro OE constructeur | — | **à confirmer** : vérifier la disponibilité des numéros OE dans la source TecDoc ; si disponibles, les intégrer à l'index de recherche et à la fiche produit |

**Comportement attendu.**

- Normalisation de la saisie et des références indexées : suppression des espaces, tirets et points, insensibilité à la casse. `0986424021`, `0 986 424 021` et `0986-424-021` doivent renvoyer le même article.
- À partir de 3 caractères saisis, affichage de suggestions (temporisation de 300 ms entre la frappe et l'appel).
- Résultat unique : redirection directe vers la fiche `/piece/{id}`.
- Résultats multiples : page de résultats affichant marque, désignation, référence, catégorie et vignette.
- Aucun résultat : message explicite rappelant les types de références acceptés, et proposition de basculer sur la recherche par véhicule.
- La recherche porte sur l'ensemble du périmètre catalogue (whitelist catégories et marques en vigueur), indépendamment du véhicule sélectionné. Le véhicule sélectionné n'est pas effacé par une recherche.

**Point d'API suggéré :** `GET /api/parts/search?q={terme}&limit={n}`.

**Critères d'acceptation.**
- La saisie de `4047026182927` mène à la fiche BOSCH `0 986 424 021`.
- La saisie de `22525` renvoie l'ensemble des articles portant ce numéro WVA, toutes marques confondues.
- Le champ est accessible au clavier et fonctionne depuis la fiche produit comme depuis la liste.

---

### Mise en avant systématique de la marque ETF (P1)

**Contexte.** ETF est la marque partenaire du groupe ; sa visibilité doit être garantie sur l'ensemble du catalogue.

**Attendu.**

- Dans toute liste de pièces, les articles de marque **ETF sont systématiquement positionnés en tête** du jeu de résultats.
- L'épinglage s'applique **sur l'ensemble des résultats avant pagination**, et non page par page : les articles ETF doivent apparaître en page 1, jamais dispersés sur les pages suivantes.
- Un marqueur visuel discret distingue les articles ETF (badge, liseré ou libellé court). Le style reste à définir avec la direction ; il ne doit pas ressembler à une publicité tierce.
- Dans la facette *Marques*, ETF est placé en première position, les autres marques suivant selon l'ordre retenu (alphabétique ou par nombre décroissant, à trancher).
- Interaction avec le tri (D4) : l'épinglage ETF reste actif pour le tri par défaut (« Pertinence »). Lorsqu'un tri explicite est choisi par l'utilisateur (marque, désignation, essieu), l'épinglage est levé afin que le tri demandé reste prévisible.

**Critères d'acceptation.**
- Sur le véhicule `57281` (36 pièces, dont 2 ETF), les 2 articles ETF apparaissent aux positions 1 et 2 de la page 1 en tri par défaut.
- Le comportement est identique quel que soit le nombre d'éléments par page.

---

## Performance

### Optimisation des images produit (P1)

**Constat.** Les images TecDoc sont servies dans leur résolution d'origine (1280 × 914 px et 1280 × 1013 px constatés) depuis le stockage objet `fsn1.your-objectstorage.com`, puis affichées dans des balises `<img>` de 160 px de large. Aucune optimisation n'est en place : pas de composant `next/image`, pas d'attribut `loading="lazy"`, pas de `srcset`, pas d'attributs `width`/`height`. Dix images par page en configuration par défaut.

Le poids exact n'a pas pu être mesuré (le stockage objet ne renvoie pas d'en-tête CORS, ce qui empêche la mesure depuis le navigateur). **Estimation à confirmer par l'équipe technique :** 80 à 250 Ko par image, soit 1 à 2,5 Mo par page de liste. Les temps de réponse de l'API étant excellents (28 à 45 ms mesurés), les images constituent l'essentiel de la latence perçue.

**Attendu.**

1. **Génération de vignettes côté serveur**, au moment de la synchronisation/ingestion des données TecDoc (et non à la volée à chaque requête) :
   - deux largeurs : 200 px et 400 px ;
   - format WebP avec repli JPEG ;
   - stockage sur le stockage objet Hetzner existant, à côté des originaux.
2. **Liste de pièces** : utilisation des vignettes via `srcset` / `sizes`, avec `loading="lazy"` sur toutes les images hors du premier écran.
3. **Fiche produit** : image d'origine conservée, chargée en `lazy` sauf l'image principale.
4. **Attributs `width` et `height`** systématiques sur toutes les balises image, afin d'éliminer les décalages de mise en page (CLS).
5. **Texte alternatif** renseigné : marque + désignation + référence (ex. « BOSCH — Kit de plaquettes de frein — 0 986 424 021 »).
6. **Activation de CORS et de `Timing-Allow-Origin`** sur le stockage objet, afin de permettre la mesure des performances côté client.

**Critères d'acceptation.**
- Poids cumulé des images d'une page de liste (20 articles) inférieur à 300 Ko.
- LCP inférieur à 2,5 s sur connexion 4G simulée.
- Score CLS inférieur à 0,1.

---

## Ergonomie (UX)



### Ajout d'un tri des résultats (P2)

**Constat.** Aucun tri n'est proposé ; l'ordre d'affichage n'est pas explicité.

**Attendu.** Sélecteur de tri au-dessus de la liste, avec les options suivantes :

- **Pertinence** (par défaut, ETF en tête conformément à B2) ;
- Marque (A → Z) ;
- Position sur le véhicule (essieu avant, puis essieu arrière) ;
- Désignation (A → Z) ;
- *Prix* — option présente mais grisée, en prévision de l'intégration tarifaire ultérieure.

Le tri sélectionné est reflété dans l'URL, au même titre que les filtres (le schéma actuel `?vehicule=&cat=&f=` est correct et doit être étendu, par exemple avec `&tri=`).

### Validation et normalisation de la saisie d'immatriculation (P2)

**Constat.** Aucune validation de format n'est effectuée côté client, ce qui consomme inutilement des appels au service d'identification (facturés à la requête). Par ailleurs, toutes les situations d'échec renvoient le même message : « Aucun véhicule trouvé pour cette immatriculation. »

**Attendu.**

1. **Aucun appel réseau** si le format est invalide.
2. **Messages distincts** selon la situation :
   - format invalide : « Format de plaque non reconnu. » ;
   - réponse 404 : « Aucun véhicule trouvé pour cette immatriculation. » ;
   - erreur 5xx ou expiration du délai : « Le service d'identification est momentanément indisponible. »


---

### Pages d'erreur francisées (P3)

**Constat.** L'accès à `/piece/99999999` renvoie la page 404 par défaut de Next.js, en anglais et sans habillage : « 404 — This page could not be found. »

**Attendu.**
- Page 404 personnalisée, en français avec un message explicite et deux actions : « Retour au catalogue » et accès au champ de recherche par référence (B1).
- Page 500 traitée de la même manière.
- Vérifier également le message générique déjà en place sur le catalogue (« Impossible de charger le catalogue »), dont le détail technique affiché (« Impossible de charger les articles ») n'apporte aucune information exploitable : soit l'enrichir d'un identifiant d'incident à communiquer au support, soit le retirer.

---

### Autre

- **Libellé du véhicule perdu sur accès direct par URL** — l'ouverture de `https://frein.jumbopneus.pro/?vehicule=57281` affiche « Véhicule #57281 » au lieu de « RENAULT CLIO IV (BH_) | 1.5 dCi 90 », le libellé dépendant de l'état de session (`PUT /api/vehicle/selection`) et non d'une résolution par identifiant. Impacte les liens partagés et les favoris. **Anomalie confirmée.**

## Sécurité


### Compléter les en-têtes HTTP de sécurité (P2)

**Constat.** En-têtes actuellement présents sur le document :

| En-tête | Valeur constatée |
|---------|------------------|
| `Strict-Transport-Security` | `max-age=31536000` |
| `X-Frame-Options` | `SAMEORIGIN` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `X-Powered-By` | `Next.js` |
| `Content-Security-Policy` | absent |
| `Permissions-Policy` | absent |

**Attendu.**

- **Ajouter une `Content-Security-Policy`**, à déployer d'abord en mode `Content-Security-Policy-Report-Only` afin d'identifier les blocages avant application. Base de départ à ajuster :
  `default-src 'self'; img-src 'self' https://fsn1.your-objectstorage.com data:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'`
- **Ajouter `Permissions-Policy`** : `geolocation=(), camera=(), microphone=(), payment=(), usb=()`
- **Compléter HSTS** avec `includeSubDomains` ; envisager `preload` après validation sur l'ensemble des sous-domaines.
- **Supprimer l'en-tête `X-Powered-By`** (divulgation inutile de la pile technique).


## Architecture et API


### Regrouper les appels `/api/parts` par catégorie (P3)

**Constat.** Le chargement d'un véhicule déclenche un appel par catégorie de la whitelist, en parallèle :
`GET /api/parts?vehicleId=57281&categoryId=100030` et `GET /api/parts?vehicleId=57281&categoryId=100032`.
L'ajout d'une troisième catégorie au périmètre entraînera mécaniquement un troisième appel.

**Attendu.**
- Point d'API acceptant plusieurs catégories en un seul appel : `GET /api/parts?vehicleId={id}&categoryIds=100030,100032`, renvoyant les articles regroupés par catégorie.
- Maintien temporaire de la signature actuelle pour compatibilité, avec date de retrait annoncée.

---

### Préparer la pagination et le filtrage côté serveur (P3)

**Constat.** L'intégralité des pièces d'un véhicule est chargée en une fois, puis filtrée et paginée côté client (aucun appel réseau n'est déclenché lors d'un changement de filtre). Avec 36 pièces par véhicule, ce fonctionnement est parfaitement adapté et procure une navigation instantanée.

**Attendu.** Ne rien modifier aujourd'hui, mais **concevoir l'API dans une optique de bascule** : prévoir dès à présent les paramètres `page`, `pageSize`, `sort`, `brands`, `categoryIds` sur `/api/parts`, ainsi que le renvoi des compteurs de facettes (nécessaires à A2) calculés côté serveur.

**Seuil de bascule proposé :** passage effectif au filtrage et à la pagination côté serveur dès qu'un véhicule dépasse environ 200 pièces, ou dès l'ajout d'une troisième catégorie au périmètre.
