// Requêtes Google Shopping et filtres pour chaque composant proposé à l'achat.
//
// `must` : expressions qui doivent toutes apparaître dans le titre de l'offre.
// `not`  : expressions qui excluent l'offre (variantes voisines, autres capacités…).
// Les titres sont comparés en minuscules et sans accents.

export interface PriceQuery {
  q: string;
  must: RegExp[];
  not?: RegExp[];
  /**
   * Requête générique (plusieurs produits différents, ex. « SSD NVMe 1 To ») :
   * on garde une offre par produit et par marchand, au lieu d'une seule par marchand.
   */
  generic?: boolean;
}

/** Exclusions communes à toutes les catégories (occasion, reconditionné, lots « A + B »). */
export const GLOBAL_EXCLUDE =
  /reconditionn|occasion|seconde main|refurb|renewed|ricondizionat|remis a neuf|pieces detachees|pour pieces|\bjunk\b|defectueu|en panne|\bvends\b|vente en gros|wholesale|\s\+\s/;

/** Vendeurs d'occasion ou de reconditionné : leurs offres ne reflètent pas le prix du neuf. */
export const MERCHANT_EXCLUDE = /leboncoin|beebs|back ?market|ebay|vinted|factorefurb|renewtech|label emmaus|easycash|cash converters|stockx/;

/**
 * Places de marché étrangères ou d'import : prix hors France (douane, port, garantie incertaine) ou annonces
 * peu fiables. Leurs offres faussent le « meilleur prix » affiché.
 */
export const FOREIGN_EXCLUDE =
  /alibaba|aliexpress|temu|\bwish\b|ubuy|microless|rightdeal|shoppydeals|yoho|golookshop|biteks|lambdatek|onbuy|banzaihobby|desertcart|fruugo|informaticabarata|it-market|showgiftprive|\.sk\b|\.ro\b|\.pl\b|\.hu\b|\.cz\b|\.co\.uk\b|\buk\b/;

/** Exclusions par catégorie (PC complets, accessoires…). */
export const CATEGORY_EXCLUDE: Record<string, RegExp> = {
  gpu: /\bpc\b|ordinateur|laptop|portable|waterblock|water block|backplate|support|cable|riser|station/,
  // Un titre de processeur qui parle de RAM, de SSD, de Go ou de Windows est un PC complet.
  cpu: /\bpc\b|ordinateur|laptop|portable|ventirad|refroidiss|cooler|carte mere|motherboard|\bkit\b|bundle|pack|\bram\b|\bssd\b|\bhdd\b|\d+ ?(go|gb|to|tb)\b|windows|\bwin ?1[01]\b|gaming|gamer|tour\b/,
  board: /\bpc\b|ordinateur|\bkit\b|bundle|pack|processeur inclus/,
  // Mémoire de portable (SO-DIMM, réf. Crucial « SFD ») et de serveur (ECC, RDIMM, Kingston KSM, Micron MTA) : autres produits, autres prix.
  ram: /so-?dimm|portable|laptop|notebook|\bpc gamer\b|serveur|server|\becc\b|rdimm|registered|\bksm\d|\bmta\d|g4sfd|g5sfd|1 ?x ?64|2rx4|4rx4/,
  ssd: /\bpc\b|ordinateur|laptop|portable|externe|boitier|enclosure|adaptateur/,
  psu: /\bpc\b|ordinateur|cable|rallonge|sleeve|boitier/,
  cooler: /\bpc\b|ordinateur|pate thermique|kit de fixation|bracket/,
  fans: /\bpc\b|ordinateur/,
  case: /\bpc\b|ordinateur|panneau|filtre|support/,
};

/** Le nombre de watts, seul ou dans un nom de modèle (« 750 W », « RM750e », « A750GL »), mais pas dans 7500. */
const watts = (w: number) => new RegExp(`(^|\\D)${w}(?!\\d)`);
/** Gamme Gold : mentionnée, ou implicite dans les références courantes (750G, A750GL, P750GM, RM750e…). */
const GOLD = /gold|\d{3,4} ?g[lmx]?\b|\brm\d{3,4}e\b|\bpq\d{3,4}m?\b/;
const NOT_GOLD = /bronze|white plus|\bcx\d{3}|platinum|titanium|sfx|tfx/;

export const QUERIES: Record<string, PriceQuery> = {
  // Cartes graphiques
  "rtx-5060": { q: "carte graphique GeForce RTX 5060 8 Go", must: [/rtx ?5060\b/], not: [/\bti\b/] },
  // La capacité manque souvent dans les titres : on exclut les versions 8 Go au lieu d'exiger « 16 Go ».
  "rtx-5060ti-16": { q: "carte graphique GeForce RTX 5060 Ti 16 Go", must: [/rtx ?5060 ?ti/], not: [/\b8 ?g[ob]?\b/] },
  "rtx-5070": { q: "carte graphique GeForce RTX 5070 12 Go", must: [/rtx ?5070\b/], not: [/\bti\b/] },
  "rtx-5070ti": { q: "carte graphique GeForce RTX 5070 Ti 16 Go", must: [/rtx ?5070 ?ti/] },
  "rtx-5080": { q: "carte graphique GeForce RTX 5080 16 Go", must: [/rtx ?5080\b/] },
  "rx-9060xt-16": { q: "carte graphique Radeon RX 9060 XT 16 Go", must: [/9060 ?xt/], not: [/\b8 ?g[ob]?\b/] },
  "rx-9070": { q: "carte graphique Radeon RX 9070 16 Go", must: [/rx ?9070\b/], not: [/\bxt\b/, /\bgre\b/] },
  "rx-9070xt": { q: "carte graphique Radeon RX 9070 XT 16 Go", must: [/9070 ?xt/] },

  "rtx-5050": { q: "carte graphique GeForce RTX 5050 8 Go", must: [/rtx ?5050\b/] },
  "rtx-5090": { q: "carte graphique GeForce RTX 5090 32 Go", must: [/rtx ?5090\b/] },
  "rx-9060xt-8": { q: "carte graphique Radeon RX 9060 XT 8 Go", must: [/9060 ?xt/, /\b8 ?g[ob]?\b/], not: [/16 ?g/] },
  "rtx-4060": { q: "carte graphique GeForce RTX 4060 8 Go", must: [/rtx ?4060\b/], not: [/\bti\b/] },
  "rtx-4060ti": { q: "carte graphique GeForce RTX 4060 Ti", must: [/rtx ?4060 ?ti/] },
  "rtx-4070s": { q: "carte graphique GeForce RTX 4070 Super 12 Go", must: [/rtx ?4070 ?super/], not: [/\bti\b/] },
  "rx-7600": { q: "carte graphique Radeon RX 7600 8 Go", must: [/rx ?7600\b/] },
  "rx-7700xt": { q: "carte graphique Radeon RX 7700 XT 12 Go", must: [/rx ?7700 ?xt/] },
  "rx-7800xt": { q: "carte graphique Radeon RX 7800 XT 16 Go", must: [/rx ?7800 ?xt/] },
  "rx-7900gre": { q: "carte graphique Radeon RX 7900 GRE 16 Go", must: [/7900 ?gre/] },
  "rx-7900xt": { q: "carte graphique Radeon RX 7900 XT 20 Go", must: [/rx ?7900 ?xt\b/], not: [/xtx/] },
  "arc-a750": { q: "carte graphique Intel Arc A750 8 Go", must: [/\ba750\b/] },
  "arc-b570": { q: "carte graphique Intel Arc B570 10 Go", must: [/\bb570\b/] },
  "arc-b580": { q: "carte graphique Intel Arc B580 12 Go", must: [/\bb580\b/] },

  // Processeurs (neufs)
  "i3-12100f": { q: "processeur Intel Core i3-12100F", must: [/12100f/] },
  "i3-14100f": { q: "processeur Intel Core i3-14100F", must: [/14100f/] },
  "i3-12100": { q: "processeur Intel Core i3-12100", must: [/12100\b/], not: [/12100 ?f/] },
  "i5-12400": { q: "processeur Intel Core i5-12400", must: [/12400\b/], not: [/12400 ?f/] },
  "r5-5600g": { q: "processeur AMD Ryzen 5 5600G", must: [/5600g\b/], not: [/5600gt/] },
  "i5-13400f": { q: "processeur Intel Core i5-13400F", must: [/13400f/] },
  "i5-12600kf": { q: "processeur Intel Core i5-12600KF", must: [/12600kf/] },
  "i7-12700kf": { q: "processeur Intel Core i7-12700KF", must: [/12700kf/] },
  "r5-5600x": { q: "processeur AMD Ryzen 5 5600X", must: [/5600x\b/], not: [/5600x3d/] },
  "r7-5800x3d": { q: "processeur AMD Ryzen 7 5800X3D", must: [/5800x3d/] },
  "r5-8600g": { q: "processeur AMD Ryzen 5 8600G", must: [/8600g\b/] },
  "r7-7700": { q: "processeur AMD Ryzen 7 7700", must: [/ryzen 7 7700\b/], not: [/7700 ?x/] },
  "r7-7700x": { q: "processeur AMD Ryzen 7 7700X", must: [/7700x\b/], not: [/7700x3d/] },
  "i9-14900k": { q: "processeur Intel Core i9-14900K", must: [/14900k\b/], not: [/14900ks/] },
  "u9-285k": { q: "processeur Intel Core Ultra 9 285K", must: [/285k\b/] },
  "r5-5500": { q: "processeur AMD Ryzen 5 5500", must: [/ryzen 5 5500\b/], not: [/5500 ?(x3d|gt|u)\b/] },
  "r7-5700x": { q: "processeur AMD Ryzen 7 5700X", must: [/5700x\b/], not: [/5700x3d/] },
  "r5-7500f": { q: "processeur AMD Ryzen 5 7500F", must: [/7500f/] },
  "r7-9700x": { q: "processeur AMD Ryzen 7 9700X", must: [/9700x\b/] },
  "r9-9900x": { q: "processeur AMD Ryzen 9 9900X", must: [/9900x\b/], not: [/9900x3d/] },
  "r9-9950x": { q: "processeur AMD Ryzen 9 9950X", must: [/9950x\b/], not: [/9950x3d/] },
  "r9-9950x3d": { q: "processeur AMD Ryzen 9 9950X3D", must: [/9950x3d/] },
  "i5-12400f": { q: "processeur Intel Core i5-12400F", must: [/12400f/] },
  "i5-14400f": { q: "processeur Intel Core i5-14400F", must: [/14400f/] },
  "i5-14600kf": { q: "processeur Intel Core i5-14600KF", must: [/14600kf/] },
  "i7-14700kf": { q: "processeur Intel Core i7-14700KF", must: [/14700kf/] },
  "u5-245kf": { q: "processeur Intel Core Ultra 5 245KF", must: [/245kf/] },
  "u7-265kf": { q: "processeur Intel Core Ultra 7 265KF", must: [/265kf/] },
  "r5-5600": { q: "processeur AMD Ryzen 5 5600", must: [/ryzen 5 5600\b/], not: [/5600 ?(x|g|gt|xt|t|x3d)\b/] },
  "r7-5700x3d": { q: "processeur AMD Ryzen 7 5700X3D", must: [/5700x3d/] },
  "r5-7600": { q: "processeur AMD Ryzen 5 7600", must: [/ryzen 5 7600\b/], not: [/7600 ?(x|x3d)\b/] },
  "r5-9600x": { q: "processeur AMD Ryzen 5 9600X", must: [/9600x\b/], not: [/9600x3d/] },
  "r7-7800x3d": { q: "processeur AMD Ryzen 7 7800X3D", must: [/7800x3d/] },
  "r7-9800x3d": { q: "processeur AMD Ryzen 7 9800X3D", must: [/9800x3d/] },

  // Cartes mères génériques par chipset et format. « B650 » sans suffixe = ATX ; « B650M » = micro-ATX.
  // (\b exclut d'office B650M / B650E / B650I, puisque la lettre colle au numéro.)
  "mb-b760-ddr4-atx": { q: "carte mère B760 DDR4 ATX", must: [/\bb760\b/, /ddr4|\bd4\b/], not: [/itx|mini|micro|m-?atx|\bb760m/], generic: true },
  "mb-b760-ddr4-matx": { q: "carte mère B760M DDR4 micro ATX", must: [/\bb760m\b/, /ddr4|\bd4\b/], generic: true },
  "mb-b760-ddr5-atx": { q: "carte mère B760 DDR5 ATX", must: [/\bb760\b/], not: [/ddr4|\bd4\b|itx|mini|micro|m-?atx|\bb760m/], generic: true },
  "mb-b760-ddr5-matx": { q: "carte mère B760M DDR5 micro ATX", must: [/\bb760m\b/], not: [/ddr4|\bd4\b/], generic: true },
  "mb-b860-atx": { q: "carte mère B860 ATX LGA1851", must: [/\bb860\b/], not: [/itx|mini|micro|m-?atx|\bb860m/], generic: true },
  "mb-b860-matx": { q: "carte mère B860M micro ATX LGA1851", must: [/\bb860m\b/], generic: true },
  "mb-b550-atx": { q: "carte mère B550 ATX AM4", must: [/\bb550\b/], not: [/itx|mini|micro|m-?atx|\bb550m/], generic: true },
  "mb-b550-matx": { q: "carte mère B550M micro ATX AM4", must: [/\bb550m\b/], generic: true },
  "mb-a620-matx": { q: "carte mère A620M micro ATX AM5", must: [/\ba620m?\b/], not: [/itx/], generic: true },
  "mb-b650-atx": { q: "carte mère B650 ATX AM5", must: [/\bb650\b/], not: [/itx|mini|micro|m-?atx|\bb650m/], generic: true },
  "mb-b650-matx": { q: "carte mère B650M micro ATX AM5", must: [/\bb650m\b/], generic: true },
  "mb-b850-atx": { q: "carte mère B850 ATX AM5", must: [/\bb850\b/], not: [/itx|mini|micro|m-?atx|\bb850m/], generic: true },

  // Mémoire vive
  // La vitesse (3200…) est souvent absente des titres et change peu le prix : on exige la capacité et le type.
  // On écarte les modules de serveur (ECC/RDIMM) et les références constructeur (Dell, Lenovo…), plus chers.
  "d4-1x8-3200": { q: "barrette mémoire 8 Go DDR4 3200 MHz", must: [/\b8 ?g[ob]\b/, /ddr4/], not: [/\d ?x ?\d|\bkit\b|16 ?g[ob]|32 ?g[ob]|\becc\b|rdimm|dell|lenovo|\bhp\b|asus/] },
  "d4-1x16-3200": { q: "barrette mémoire 16 Go DDR4 3200 MHz", must: [/\b16 ?g[ob]\b/, /ddr4/], not: [/\d ?x ?\d|\bkit\b|32 ?g[ob]|\becc\b|rdimm|dell|lenovo|\bhp\b|asus/] },
  "d4-2x8-3200": { q: "kit mémoire 16 Go 2x8 Go DDR4 3200 CL16", must: [/2 ?x ?8/, /ddr4/] },
  "d4-2x16-3200": { q: "kit mémoire 32 Go 2x16 Go DDR4 3200 CL16", must: [/2 ?x ?16/, /ddr4/] },
  "d4-2x32-3200": { q: "kit mémoire 64 Go 2x32 Go DDR4 3200", must: [/2 ?x ?32|\b64 ?g[ob]\b/, /ddr4/], not: [/128 ?g[ob]|\b4 ?x|\b1 ?x ?32/] },
  // En DDR5, « 32 Go » désigne presque toujours un kit 2 × 16 Go (référence en « M2 » chez Corsair).
  "d5-2x16-6000": { q: "kit mémoire 32 Go 2x16 Go DDR5 6000 CL30", must: [/2 ?x ?16|\b32 ?g[ob]\b/, /ddr5/], not: [/64 ?g[ob]|1 ?x ?32|\b4 ?x/] },
  "d5-2x32-6000": { q: "kit mémoire 64 Go 2x32 Go DDR5 6000 CL30", must: [/2 ?x ?32|\b64 ?g[ob]\b/, /ddr5/], not: [/128 ?g[ob]|\b4 ?x|\b1 ?x ?32/] },

  // Stockage
  // Requêtes génériques par type et capacité (les SSD sont interchangeables).
  "nvme-1tb": { q: "SSD NVMe M.2 1 To PCIe 4.0 interne", must: [/nvme|m\.?2/, /\b1 ?t[ob]\b|1000 ?g[ob]?\b/], not: [/\bsata\b|2230|2242|heatsink|dissipateur/], generic: true },
  "nvme-2tb": { q: "SSD NVMe M.2 2 To PCIe 4.0 interne", must: [/nvme|m\.?2/, /\b2 ?t[ob]\b|2000 ?g[ob]?\b/], not: [/\bsata\b|2230|2242|heatsink|dissipateur/], generic: true },
  "sata-1tb": { q: "SSD SATA 2,5 pouces 1 To interne", must: [/\bsata\b|2[.,]5/, /\b1 ?t[ob]\b|1000 ?g[ob]?\b|960 ?g[ob]?\b/], not: [/nvme|\bhdd\b|disque dur (?!ssd)|7200|5400/], generic: true },
  "sata-2tb": { q: "SSD SATA 2,5 pouces 2 To interne", must: [/\bsata\b|2[.,]5/, /\b2 ?t[ob]\b|2000 ?g[ob]?\b|1920 ?g[ob]?\b/], not: [/nvme|\bhdd\b|disque dur (?!ssd)|7200|5400/], generic: true },

  // Alimentations génériques par puissance. À partir de 650 W : gamme 80+ Gold (les modèles récents sont ATX 3.x).
  // La puissance figure souvent dans le nom du modèle (RM750e, A750GL, PQ750G) plutôt qu'en « 750 W ».
  "psu-550": { q: "alimentation PC 550W 80 Plus Bronze ATX", must: [/\b550 ?w/], not: [/sfx|tfx|flex|externe|adaptateur/], generic: true },
  "psu-650": { q: "alimentation PC 650W 80 Plus Gold ATX 3.1 modulaire", must: [watts(650), GOLD], not: [NOT_GOLD], generic: true },
  "psu-750": { q: "alimentation PC 750W 80 Plus Gold ATX 3.1 modulaire", must: [watts(750), GOLD], not: [NOT_GOLD], generic: true },
  "psu-850": { q: "alimentation PC 850W 80 Plus Gold ATX 3.1 modulaire", must: [watts(850), GOLD], not: [NOT_GOLD], generic: true },
  "psu-1000": { q: "alimentation PC 1000W 80 Plus Gold ATX 3.1 modulaire", must: [watts(1000), GOLD], not: [NOT_GOLD], generic: true },

  // Refroidissement
  "arctic-f36": { q: "ventirad Arctic Freezer 36", must: [/freezer 36/] },
  pa120se: { q: "ventirad Thermalright Peerless Assassin 120 SE", must: [/peerless assassin 120 ?se/] },
  "lf3-360": { q: "watercooling Arctic Liquid Freezer III 360", must: [/liquid freezer iii/, /360/] },
  "p12-5": { q: "ventilateurs Arctic P12 PWM PST Value Pack 5", must: [/p12/, /value ?pack|pack de 5|lot de 5|5 ?pcs|\b5 ?x\b|\(5\)/] },

  // Boîtiers
  "lancool-216": { q: "boîtier Lian Li Lancool 216", must: [/lancool 216/], not: [/216 ?x\b/] },
  "pop-air": { q: "boîtier Fractal Design Pop Air", must: [/pop air/], not: [/\bmini\b|\bsilent\b|\bxl\b/] },
};
