# PCEvolu

Logiciel Windows qui analyse les composants du PC, détecte ce qui le freine et propose une liste d'upgrades.

## Stack

- **Tauri 2** : application de bureau légère (installeur d'environ 10 Mo)
- **Rust** (`src-tauri/`) : scan matériel en local (WMI, registre, API d'affichage Windows, nvidia-smi)
- **React + TypeScript + Vite** (`src/`) : interface

## Lancer

```bash
npm install
npm run app        # l'app de bureau, avec rechargement à chaud
npm run dev        # l'interface seule dans le navigateur, avec des données de démo
npm run package    # crée l'installeur Windows (src-tauri/target/.../bundle/nsis)
```

Prérequis : Node 18+, Rust (rustup), Visual Studio Build Tools avec « Développement Desktop C++ ».

## Organisation

| Fichier | Rôle |
|---|---|
| `src-tauri/src/scan.rs` | Scan complet : CPU, GPU, RAM, carte mère, BIOS, disques, volumes, écrans, réseau, audio |
| `src-tauri/src/live.rs` | Mesures en temps réel : charge CPU, RAM, GPU (toutes les 2 s) |
| `src/recommendations.ts` | Moteur de recommandations (règles) et liste d'upgrades |
| `src/App.tsx` | Interface : vue d'ensemble, améliorations, composants |
| `src/demo.ts` | Données de démo pour travailler l'interface sans Tauri |
| `src/upgrade/catalog.ts` | Catalogue : chipsets, CPU, cartes mères, GPU, RAM, SSD, alims, ventirads, boîtiers (prix indicatifs) |
| `src/upgrade/profile.ts` | Profil de compatibilité de la config (scan + questionnaire alim / boîtier / refroidissement) |
| `src/upgrade/engine.ts` | Moteur de compatibilité : vérifie chaque contrainte et ajoute les composants nécessaires |
| `src/upgrade/UpgradesView.tsx` | Vue « Upgrades » : propositions par catégorie, contrôles, liste d'achat |

## Reconnaissance des composants

- **Processeurs** (`src/upgrade/cpudb.ts`) : décodés depuis leur nom. « i5-10600KF » donne la génération, la gamme, l'overclocking et l'iGPU, puis socket, RAM, consommation et indices de performance. Ça couvre les Intel Core de 4e à 14e génération, les Core Ultra 200S, les Pentium/Celeron récents et tous les Ryzen, portables compris.
- **Cartes graphiques** (`src/upgrade/gpudb.ts`) : la table couvre NVIDIA GTX 10 → RTX 50, AMD RX 400 → RX 9000 et Intel Arc, plus les puces intégrées. Les versions portables valent ≈ 70 % des versions de bureau, et les modèles absents sont estimés d'après le plus proche.
- **Chipsets** (`src/upgrade/catalog.ts`) : 55 chipsets, du LGA1150 (DDR3) à l'AM5.
- **Cas particuliers** : sur un PC portable, on ne propose ni processeur ni carte graphique (soudés). Sur un PC de marque (Dell, HP, Lenovo…), l'app prévient que l'alim et la carte mère sont souvent propriétaires. En DDR3, elle oriente vers une nouvelle plateforme.

```bash
npm test                         # reconnaissance de ~100 noms réels (processeurs, cartes graphiques, chipsets)
npx tsx scripts/test-engine.ts   # propositions sur 4 configs types (PC de marque, portable, entrée de gamme, haut de gamme)
```

## Catalogue téléchargeable

`npm run catalog` exporte le catalogue dans `data/catalog.json`. Au démarrage, l'app télécharge ce fichier (`VITE_CATALOG_URL`) et l'utilise s'il est plus récent (`CATALOG_VERSION`). On peut donc ajouter des composants sans publier de nouvelle version de l'app.

## Moteur d'upgrades

Pour chaque composant candidat, le moteur vérifie les contraintes face à la config actuelle. Quand une contrainte échoue et qu'un autre composant la résout, il l'ajoute à la proposition :

- **Carte graphique** → alimentation (puissance, connecteurs 8 broches / 12V-2x6), longueur dans le boîtier, ventilation, équilibre avec le CPU, port PCIe (cartes x8 sur PCIe 3.0)
- **Processeur** → socket et chipset (sinon carte mère), type de RAM de la nouvelle carte (sinon kit RAM), fixation et puissance du ventirad, BIOS, alimentation
- **RAM** → type, emplacements libres, vitesse réelle selon la plateforme, dual channel
- **Stockage** → emplacements M.2 libres, génération PCIe

Chaque ajout a un rôle : *obligatoire*, *à vérifier* (dépend d'une info non détectable), ou *conseillé*.

## Prix du marché (relevé hebdomadaire)

`scripts/update-prices.ts` relève chaque semaine le prix des composants proposés à l'achat :

1. recherche Google Shopping France via [Serper.dev](https://serper.dev) (requêtes et filtres dans `scripts/price-queries.ts`) ;
2. ne garde que les offres dont le titre correspond au composant (exclut variantes, PC complets, occasion, accessoires…) ;
3. une offre par marchand, élimination des prix aberrants, puis **médiane** (au moins 3 marchands, sinon le prix précédent est conservé) ;
4. écrit `data/prices.json`.

Le workflow `.github/workflows/prices.yml` le lance chaque lundi (et à la demande via « Run workflow ») et publie le fichier. L'app télécharge ce fichier au démarrage (`VITE_PRICES_URL` dans `.env`), avec repli sur le cache, puis sur la copie incluse à la compilation, puis sur les prix du catalogue.

```bash
npm run prices -- --fixtures scripts/fixtures --out test.json   # test hors ligne, sans clé
npm run prices -- --only rtx-5070,rm750e                         # quelques composants (clé dans .env)
npm run prices                                                   # relevé complet (≈ 52 recherches)
```

## Vie privée

Tout est lu et traité en local. Aucun numéro de série, nom de PC ou nom d'utilisateur n'est collecté, et rien n'est envoyé sur Internet.

## Note de compilation

Les fichiers de compilation Rust sont placés hors de OneDrive (`src-tauri/.cargo/config.toml`) pour ne pas saturer la synchronisation.
