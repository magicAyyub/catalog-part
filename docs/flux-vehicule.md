# Du numéro de plaque à la pièce affichée

Ce document explique où passent le temps et l'argent quand un franchisé cherche
des plaquettes, et quelles décisions sont sur la table.

Un seul chiffre à garder en tête : **un appel facturé**, c'est une requête payée
à RapidAPI. Tout le reste en découle.

Ce document est l'analyse qui a mené à l'état actuel, gardée telle quelle pour le
raisonnement. Son « aujourd'hui » décrit le passage par app-etf, qui n'existe
plus : la plaque est résolue chez Exadis en une requête, et app-etf a été retiré
parce qu'il lisait son propre K-Type chez Exadis, donc ne couvrait pas la panne
qu'il était censé couvrir. Le README décrit le flux en vigueur.

---

## 1. Ce qui se passe aujourd'hui

```mermaid
flowchart TD
    A["Le franchisé saisit<br/>AA-123-BB"]
    B["app-etf<br/>se connecte chez le fournisseur<br/>et scrape le catalogue entier"]
    C["K-Type 15901"]
    D["On retrouve quel véhicule<br/>se cache derrière ce numéro"]
    E["PEUGEOT 307 (3A/C) 1.6 16V"]
    F["On va chercher les pièces"]
    G["62 plaquettes et disques<br/>affichés à l'écran"]

    A --> B
    B -->|"8 à 18 secondes<br/>les pièces trouvées sont jetées"| C
    C --> D
    D -->|"1 à 3 appels facturés"| E
    E --> F
    F -->|"environ 10 appels facturés"| G
```

Trois étapes, trois natures de coût très différentes :

| Étape | Qui répond | Ce que ça coûte |
|---|---|---|
| Plaque → K-Type | app-etf | 8 à 18 secondes d'attente, 0 appel facturé |
| K-Type → véhicule | RapidAPI | 1 à 3 appels facturés |
| Véhicule → pièces | RapidAPI | environ 10 appels facturés |

La troisième étape est déjà bien optimisée : un véhicule déjà vu coûte 0, un
véhicule sœur coûte 3 au lieu de 10.

Les deux premières, non. Voici pourquoi.

---

## 2. Premier gaspillage : on attend un scrape dont on jette le résultat

app-etf sait faire une chose dont on a absolument besoin : traduire une plaque en
K-Type. Mais pour la faire, il scrape tout le catalogue du fournisseur.

```mermaid
flowchart LR
    A["Plaque"] --> B["app-etf"]
    B --> C["Identité du véhicule<br/>marque, modèle, K-Type"]
    B --> D["Le catalogue de pièces<br/>du fournisseur"]
    C --> E["On garde"]
    D --> F["On jette"]

    style E stroke-width:3px
    style F stroke-dasharray: 5 5
```

Le service fait un scrape produits complet de 8 à 18 secondes, et on ne conserve
que l'en-tête véhicule.

Conséquence concrète : le franchisé regarde un écran de chargement pendant une
dizaine de secondes pour obtenir un numéro.

---

## 3. Deuxième gaspillage : on rachète une information qu'on possède déjà

Le K-Type seul ne suffit pas : il faut savoir de quel modèle il s'agit. RapidAPI
n'a pas d'endpoint qui répond à « ce K-Type, c'est quoi ? ». Alors notre code
remonte la piste par les libellés, et essaie les modèles candidats un par un.

```mermaid
flowchart TD
    K["K-Type 15901<br/>libellé reçu : « 307 »"]
    C1["Essai : 307"]
    C2["Essai : 307 SW"]
    C3["Essai : 307 CC"]
    OK["Trouvé"]

    K --> C1
    C1 -->|"1 appel facturé — raté"| C2
    C2 -->|"1 appel facturé — raté"| C3
    C3 -->|"1 appel facturé — gagné"| OK
```

Chaque essai est un appel facturé. Et c'est là que se cache le vrai gisement :

```mermaid
flowchart LR
    A["1 appel facturé<br/>engine_types_4771"]
    B["La réponse contient<br/>22 motorisations complètes<br/>avec leur K-Type"]
    C["On lit celle qu'on cherche"]
    D["On oublie les 21 autres"]

    A --> B
    B --> C
    B --> D

    style D stroke-dasharray: 5 5
```

Ce n'est pas une hypothèse, c'est mesuré dans ta base : les deux réponses
`engine_types` en cache contiennent 22 motorisations chacune. Soit **44 K-Types
déjà payés qui dorment sans servir**. Tu as aussi 209 et 172 modèles en cache, et
698 marques.

---

## 4. L'idée : se constituer une base véhicules, sans scraper

Ton manager propose de scraper le site TecDoc pour avoir notre propre base
véhicules. L'objectif est le bon. Le moyen peut être bien moins coûteux.

```mermaid
flowchart LR
    A["Scraper le site TecDoc"]
    B["Aplatir les réponses<br/>déjà présentes en cache"]
    C["1 appel par modèle<br/>sur les marques qui roulent en France"]
    Z["Base véhicules locale<br/>K-Type → modèle, moteur, puissance"]

    A -->|"~35 h de travail<br/>scraper fragile à maintenir"| Z
    B -->|"0 appel facturé"| Z
    C -->|"~22 K-Types par appel"| Z

    style Z stroke-width:3px
```

La table qui accueillerait tout ça, `td_vehicle`, **existe déjà** et a exactement
les bonnes colonnes : K-Type, marque, modèle, motorisation, puissance, carburant,
carrosserie, codes moteur, dates de construction. Elle contient 6 lignes
aujourd'hui.

Ordre de grandeur pour la troisième voie, à confirmer par un essai réel : en
ciblant la douzaine de marques qui roulent vraiment en France et en écartant les
modèles trop anciens, on est autour de **500 à 700 appels facturés une seule
fois**, pour une dizaine de milliers de K-Types.

---

## 5. Le flux obtenu

Les deux premières boîtes de décision sont en place depuis cette itération.


```mermaid
flowchart TD
    A["Plaque"]
    B["Fournisseur de K-Type<br/>app-etf, puis secours"]
    C["K-Type"]
    D{"Ce K-Type est-il<br/>dans notre base ?"}
    E["Véhicule identifié"]
    F["Marche par libellés<br/>comme aujourd'hui"]
    G{"Véhicule déjà indexé ?"}
    H["Pièces affichées"]
    I["Indexation"]

    A --> B
    B -->|"moins d'1 s"| C
    C --> D
    D -->|"oui — 0 appel, 0,03 ms"| E
    D -->|"non — repli"| F
    F --> E
    E --> G
    G -->|"oui — 0 appel"| H
    G -->|"non"| I
    I -->|"environ 10 appels"| H

    style E stroke-width:3px
    style H stroke-width:3px
```

En régime établi, une recherche par plaque devient : un appel externe court, zéro
appel facturé, réponse en millisecondes.

| | Aujourd'hui | Après |
|---|---|---|
| Attente sur la plaque | 8 à 18 s | moins d'1 s |
| K-Type → véhicule | 1 à 3 appels facturés | 0 |
| Véhicule déjà connu | 0 appel | 0 appel |
| Véhicule inconnu | environ 10 appels | environ 10 appels |
| Si app-etf tombe | recherche par plaque morte | on bascule sur un autre fournisseur |

---

## 6. Les trois leviers, un par étape

```mermaid
flowchart TD
    subgraph L1["Étape 1 · Plaque → K-Type"]
        A1["Demander à ton manager<br/>un mode « K-Type seul »"]
        A2["Chaîne de fournisseurs<br/>avec bascule automatique"]
    end
    subgraph L2["Étape 2 · K-Type → véhicule"]
        B1["Base véhicules locale<br/>construite sans scraper"]
    end
    subgraph L3["Étape 3 · Véhicule → pièces"]
        C1["Préparation nocturne<br/>sur le VPS"]
    end
```

**Étape 1.** Le geste le plus rentable ne coûte qu'un message : demander un mode
qui renvoie le K-Type sans scraper les produits. On passe de 8-18 s à moins d'une
seconde. Ensuite seulement, ajouter des fournisseurs de secours (Distriauto,
Oscaro) pour ne plus dépendre d'un seul service.

**Étape 2.** La base véhicules locale. C'est le meilleur rapport effet sur effort
du lot, et ça ne dépend de personne : ni du VPS, ni de ton manager.

**Étape 3.** Une seule ligne de crontab sur le VPS, qui la nuit renouvelle les
véhicules dont le cache expire, indexe ceux vus dans la journée, élargit la base
véhicules par lots, et sauvegarde la base. Sous un plafond d'appels par nuit,
pour qu'une nuit ne puisse jamais vider le quota du mois.

---

## 7. Où on en est

| Décision | État | Bloqué par |
|---|---|---|
| Aplatir le cache dans `td_vehicle` | fait, `pnpm vehicles:harvest` | |
| Brancher la résolution K-Type sur la base locale | fait, avec repli sur l'existant | |
| Remplir l'index à l'usage | fait, chaque appel payé est mis en banque | |
| Élargir la base à ~500-700 appels | en attente, à décider après mesure | budget |
| Demander le mode « K-Type seul » | à faire | retour de congé |
| Ajouter Distriauto / Oscaro en secours | à faire | |
| Préparation nocturne | à faire | accès au VPS |

### Ce que ça a donné

L'index est passé de 2 à 36 K-Types résolvables sans avoir dépensé un seul
appel : les deux réponses `engine_types` déjà en cache contenaient 22
motorisations chacune.

Les deux plaques de test se résolvent en 0 à 1 milliseconde, sans appel facturé.

Il faut être précis sur le gain, parce qu'il ne se voit pas partout. Pour 80 %
des modèles en cache, le libellé ne donnait déjà qu'un seul candidat : l'ancien
chemin était donc déjà bon marché. Le gain porte sur les 20 % restants, où la
marche par libellés pouvait essayer plusieurs modèles avant de tomber juste, avec
un pire cas mesuré à **26 modèles candidats** pour la PEUGEOT ION.

Le gain principal est ailleurs, et il est structurel : un appel `engine_types`
valait un K-Type, il en vaut maintenant une vingtaine. Et un K-Type connu ne
dépend plus du tout de la correspondance de libellés, donc les cas où le
véhicule était renvoyé en version dégradée disparaissent.
