import { BOARD_MODELS } from "../src/upgrade/catalog";

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
  /reconditionn|occasion|seconde main|refurb|renewed|ricondizionat|remis a neuf|pieces detachees|pour pieces|\bjunk\b|defectueu|en panne|\bvends\b|vente en gros|wholesale|pack de \d{2,}|lot de \d{2,}|\s\+\s/;

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
  // Annonces multi-capacités (« 1To/2To/4To ») : le prix affiché correspond rarement à la capacité cherchée.
  ssd: /\bpc\b|ordinateur|laptop|portable|externe|boitier|enclosure|adaptateur|\d ?t[ob]?\s*\/\s*\d|\bhpe\b|serveur|server|\bsas\b/,
  psu: /\bpc\b|ordinateur|cable|rallonge|sleeve|boitier/,
  // Ventirads et boîtiers : « pour PC » figure dans presque tous les titres, on n'exclut que les PC complets.
  cooler: /pc gamer|pc complet|unite centrale|ordinateur|pate thermique|kit de fixation|bracket|\bpack\b/,
  fans: /pc gamer|pc complet|unite centrale|ordinateur/,
  case: /pc gamer|pc complet|unite centrale|ordinateur|panneau|filtre|support|\bkit\b/,
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

  // Élargissement (novembre 2026)
  "rtx-3050": { q: "carte graphique GeForce RTX 3050 8 Go", must: [/rtx ?3050\b/], not: [/\b6 ?g[ob]?\b|laptop|portable/] },
  "rtx-3060": { q: "carte graphique GeForce RTX 3060 12 Go", must: [/rtx ?3060\b/], not: [/\bti\b|\b8 ?g[ob]?\b/] },
  "rtx-4070": { q: "carte graphique GeForce RTX 4070 12 Go", must: [/rtx ?4070\b/], not: [/\bti\b|super/] },
  "rtx-4070tis": { q: "carte graphique GeForce RTX 4070 Ti Super 16 Go", must: [/rtx ?4070 ?ti ?super/] },
  "rtx-4080s": { q: "carte graphique GeForce RTX 4080 Super 16 Go", must: [/rtx ?4080 ?super/] },
  "rtx-4090": { q: "carte graphique GeForce RTX 4090 24 Go", must: [/rtx ?4090\b/], not: [/\bd\b/] },
  "rx-6600": { q: "carte graphique Radeon RX 6600 8 Go", must: [/rx ?6600\b/], not: [/\bxt\b/] },
  "rx-6600xt": { q: "carte graphique Radeon RX 6650 XT 8 Go", must: [/rx ?66[05]0 ?xt/] },
  "rx-6700xt": { q: "carte graphique Radeon RX 6750 XT 12 Go", must: [/rx ?67[05]0 ?xt/] },
  "rx-7900xtx": { q: "carte graphique Radeon RX 7900 XTX 24 Go", must: [/7900 ?xtx/] },
  "arc-a580": { q: "carte graphique Intel Arc A580 8 Go", must: [/\ba580\b/] },
  "arc-a770": { q: "carte graphique Intel Arc A770 16 Go", must: [/\ba770\b/], not: [/\b8 ?g[ob]?\b/] },
  "rtx-5060ti-8": { q: "carte graphique GeForce RTX 5060 Ti 8 Go", must: [/rtx ?5060 ?ti/, /\b8 ?g[ob]?\b/], not: [/16 ?g/] },
  "i5-14400": { q: "processeur Intel Core i5-14400", must: [/14400\b/], not: [/14400 ?f/] },
  "i5-13600kf": { q: "processeur Intel Core i5-13600KF", must: [/13600kf/] },
  "i7-13700kf": { q: "processeur Intel Core i7-13700KF", must: [/13700kf/] },
  "i7-14700k": { q: "processeur Intel Core i7-14700K", must: [/14700k\b/], not: [/14700kf/] },
  "i9-14900kf": { q: "processeur Intel Core i9-14900KF", must: [/14900kf/] },
  "u5-225f": { q: "processeur Intel Core Ultra 5 225F", must: [/225f\b/] },
  "u5-245k": { q: "processeur Intel Core Ultra 5 245K", must: [/245k\b/], not: [/245kf/] },
  "u7-265k": { q: "processeur Intel Core Ultra 7 265K", must: [/265k\b/], not: [/265kf/] },
  "r5-5600gt": { q: "processeur AMD Ryzen 5 5600GT", must: [/5600 ?gt\b/] },
  "r7-5700": { q: "processeur AMD Ryzen 7 5700", must: [/ryzen 7 5700\b/], not: [/5700 ?(x|g|x3d)\b/] },
  "r5-7600x": { q: "processeur AMD Ryzen 5 7600X", must: [/7600x\b/], not: [/7600x3d/] },
  "r5-8500g": { q: "processeur AMD Ryzen 5 8500G", must: [/8500g\b/] },
  "r7-8700g": { q: "processeur AMD Ryzen 7 8700G", must: [/8700g\b/] },
  "r5-9600": { q: "processeur AMD Ryzen 5 9600", must: [/ryzen 5 9600\b/], not: [/9600 ?(x|x3d)\b/] },
  "r9-7900": { q: "processeur AMD Ryzen 9 7900", must: [/ryzen 9 7900\b/], not: [/7900 ?(x|x3d)\b/] },
  "r9-7900x": { q: "processeur AMD Ryzen 9 7900X", must: [/7900x\b/], not: [/7900x3d/] },
  "r9-7950x": { q: "processeur AMD Ryzen 9 7950X", must: [/7950x\b/], not: [/7950x3d/] },
  "r9-9900x3d": { q: "processeur AMD Ryzen 9 9900X3D", must: [/9900x3d/] },
  "mb-b850-matx": { q: "carte mère B850M micro ATX AM5", must: [/\bb850m\b/], generic: true },
  "mb-x870-atx": { q: "carte mère X870 ATX AM5", must: [/\bx870\b/], not: [/itx|mini|micro|m-?atx|\bx870m|x870e/], generic: true },
  "mb-z790-atx": { q: "carte mère Z790 ATX DDR5", must: [/\bz790\b/], not: [/ddr4|\bd4\b|itx|mini|micro|m-?atx|\bz790m/], generic: true },
  "mb-z890-atx": { q: "carte mère Z890 ATX", must: [/\bz890\b/], not: [/itx|mini|micro|m-?atx|\bz890m/], generic: true },
  "d4-1x32-3200": { q: "barrette mémoire 32 Go DDR4 3200 MHz", must: [/\b32 ?g[ob]\b/, /ddr4/], not: [/\d ?x ?\d|\bkit\b|64 ?g[ob]|\becc\b|rdimm|dell|lenovo|\bhp\b/] },
  "d4-2x16-3600": { q: "kit mémoire 32 Go 2x16 Go DDR4 3600", must: [/2 ?x ?16|\b32 ?g[ob]\b/, /ddr4/, /3600/] },
  "d5-1x16-5600": { q: "barrette mémoire 16 Go DDR5 5600 MHz", must: [/\b16 ?g[ob]\b/, /ddr5/], not: [/\d ?x ?\d|\bkit\b|32 ?g[ob]|\becc\b|rdimm|dell|lenovo|\bhp\b/] },
  "d5-1x32-5600": { q: "barrette mémoire 32 Go DDR5 5600 MHz", must: [/\b32 ?g[ob]\b/, /ddr5/], not: [/\d ?x ?\d|\bkit\b|64 ?g[ob]|\becc\b|rdimm|dell|lenovo|\bhp\b/] },
  "d5-2x8-5600": { q: "kit mémoire 16 Go 2x8 Go DDR5 5600", must: [/2 ?x ?8|\b16 ?g[ob]\b/, /ddr5/], not: [/32 ?g[ob]|1 ?x ?16/] },
  "d5-2x16-5600": { q: "kit mémoire 32 Go 2x16 Go DDR5 5600", must: [/2 ?x ?16|\b32 ?g[ob]\b/, /ddr5/, /5600/], not: [/64 ?g[ob]|1 ?x ?32/] },
  "d5-2x32-5600": { q: "kit mémoire 64 Go 2x32 Go DDR5 5600", must: [/2 ?x ?32|\b64 ?g[ob]\b/, /ddr5/, /5600/], not: [/128 ?g[ob]|\b4 ?x|\b1 ?x ?32/] },
  "d5-2x48-6000": { q: "kit mémoire 96 Go 2x48 Go DDR5 6000", must: [/2 ?x ?48|\b96 ?g[ob]\b/, /ddr5/] },
  "nvme5-1tb": { q: "SSD NVMe PCIe 5.0 1 To M.2", must: [/pcie ?5|gen ?5|5\.0/, /\b1 ?t[ob]\b|1000 ?g[ob]?\b/], generic: true },
  "nvme5-4tb": { q: "SSD NVMe PCIe 5.0 4 To M.2", must: [/pcie ?5|gen ?5|5\.0/, /\b4 ?t[ob]\b|4000 ?g[ob]?\b/], generic: true },
  "sata-4tb": { q: "SSD SATA 2,5 pouces 4 To interne", must: [/\bsata\b|2[.,]5/, /\b4 ?t[ob]\b|4000 ?g[ob]?\b|3840 ?g[ob]?\b/], not: [/nvme|\bhdd\b|disque dur (?!ssd)|7200|5400|externe/], generic: true },
  "hdd-8tb": { q: "disque dur interne 3,5 pouces 8 To SATA", must: [/disque dur|\bhdd\b|barracuda|wd red|ironwolf|seagate|toshiba/, /\b8 ?t[ob]\b|8000 ?g[ob]?\b/, /3[.,]5/], not: [/ssd|externe|portable|2[.,]5/], generic: true },
  "psu-750-bronze": { q: "alimentation PC 750W 80 Plus Bronze ATX", must: [watts(750), /bronze/], not: [/sfx|tfx|gold|platinum/], generic: true },
  "p14-5": { q: "ventilateurs Arctic P14 PWM PST Value Pack 5", must: [/p14/, /value ?pack|pack de 5|lot de 5|5 ?pcs|\b5 ?x\b|\(5\)/] },

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
  "nvme-500gb": { q: "SSD NVMe M.2 500 Go PCIe 4.0 interne", must: [/nvme|m\.?2/, /\b500 ?g[ob]\b|\b512 ?g[ob]\b/], not: [/\bsata\b|2230|2242|heatsink|dissipateur|externe/], generic: true },
  "nvme-4tb": { q: "SSD NVMe M.2 4 To PCIe 4.0 interne", must: [/nvme|m\.?2/, /\b4 ?t[ob]\b|4000 ?g[ob]?\b/], not: [/\bsata\b|2230|2242|externe|gen ?5|pcie ?5/], generic: true },
  "nvme5-2tb": { q: "SSD NVMe PCIe 5.0 2 To M.2", must: [/pcie ?5|gen ?5|5\.0/, /\b2 ?t[ob]\b|2000 ?g[ob]?\b/], not: [/\bsata\b|externe|pcie ?4\.0 x4 only/], generic: true },
  "sata-500gb": { q: "SSD SATA 2,5 pouces 500 Go interne", must: [/\bsata\b|2[.,]5/, /\b500 ?g[ob]\b|\b480 ?g[ob]\b/], not: [/nvme|\bhdd\b|disque dur (?!ssd)|7200|5400|externe/], generic: true },
  "hdd-2tb": { q: "disque dur interne 3,5 pouces 2 To SATA", must: [/disque dur|\bhdd\b|barracuda|wd blue|seagate|toshiba/, /\b2 ?t[ob]\b|2000 ?g[ob]?\b/, /3[.,]5/], not: [/ssd|externe|portable|2[.,]5/], generic: true },
  "hdd-4tb": { q: "disque dur interne 3,5 pouces 4 To SATA", must: [/disque dur|\bhdd\b|barracuda|wd blue|seagate|toshiba|ironwolf|wd red/, /\b4 ?t[ob]\b|4000 ?g[ob]?\b/, /3[.,]5/], not: [/ssd|externe|portable|2[.,]5/], generic: true },
  "nvme-1tb": { q: "SSD NVMe M.2 1 To PCIe 4.0 interne", must: [/nvme|m\.?2/, /\b1 ?t[ob]\b|1000 ?g[ob]?\b/], not: [/\bsata\b|2230|2242|heatsink|dissipateur/], generic: true },
  "nvme-2tb": { q: "SSD NVMe M.2 2 To PCIe 4.0 interne", must: [/nvme|m\.?2/, /\b2 ?t[ob]\b|2000 ?g[ob]?\b/], not: [/\bsata\b|2230|2242|heatsink|dissipateur/], generic: true },
  "sata-1tb": { q: "SSD SATA 2,5 pouces 1 To interne", must: [/\bsata\b|2[.,]5/, /\b1 ?t[ob]\b|1000 ?g[ob]?\b|960 ?g[ob]?\b/], not: [/nvme|\bhdd\b|disque dur (?!ssd)|7200|5400/], generic: true },
  "sata-2tb": { q: "SSD SATA 2,5 pouces 2 To interne", must: [/\bsata\b|2[.,]5/, /\b2 ?t[ob]\b|2000 ?g[ob]?\b|1920 ?g[ob]?\b/], not: [/nvme|\bhdd\b|disque dur (?!ssd)|7200|5400/], generic: true },

  // Alimentations génériques par puissance. À partir de 650 W : gamme 80+ Gold (les modèles récents sont ATX 3.x).
  // La puissance figure souvent dans le nom du modèle (RM750e, A750GL, PQ750G) plutôt qu'en « 750 W ».
  "psu-550": { q: "alimentation PC 550W 80 Plus Bronze ATX", must: [/\b550 ?w/], not: [/sfx|tfx|flex|externe|adaptateur/], generic: true },
  "psu-650-bronze": { q: "alimentation PC 650W 80 Plus Bronze ATX", must: [watts(650), /bronze/], not: [/sfx|tfx|gold|platinum/], generic: true },
  "psu-1200": { q: "alimentation PC 1200W 80 Plus Gold ATX 3.1 modulaire", must: [watts(1200), GOLD], not: [NOT_GOLD], generic: true },
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
  "nh-l9a-am5": { q: "ventirad Noctua NH-L9a-AM5", must: [/nh-?l9a/, /am5/] },
  "nh-l9i-17xx": { q: "ventirad Noctua NH-L9i-17xx", must: [/nh-?l9i/, /17xx|1700/] },
  "ax120-rse": { q: "ventirad Thermalright Assassin X 120 Refined SE", must: [/assassin x ?120/, /refined/], not: [/argb|plus/] },
  "ak400-digital": { q: "ventirad DeepCool AK400 Digital", must: [/ak400/, /digital/], not: [/pro|wh\b|white|blanc/] },
  "pure-rock-3": { q: "ventirad be quiet! Pure Rock 3", must: [/pure rock 3/], not: [/lx|fx|ventilateur bo/] },
  "nh-d15-g2": { q: "ventirad Noctua NH-D15 G2", must: [/nh-?d15/, /g2/], not: [/hbc|lbc|chromax/] },
  "pop-mini-air": { q: "boîtier Fractal Design Pop Mini Air", must: [/pop mini air/] },
  "h5-flow": { q: "boîtier NZXT H5 Flow", must: [/\bh5 flow\b/], not: [/rgb|elite/] },
  "pure-base-500dx": { q: "boîtier be quiet! Pure Base 500DX", must: [/pure base 500 ?dx/] },
  "fractal-north": { q: "boîtier Fractal Design North", must: [/fractal.*north|north.*fractal/], not: [/\bxl\b/] },
  "lancool-216": { q: "boîtier Lian Li Lancool 216", must: [/lancool 216/], not: [/216 ?x\b/] },
  "pop-air": { q: "boîtier Fractal Design Pop Air", must: [/pop air/], not: [/\bmini\b|\bsilent\b|\bxl\b/] },

  // Catalogue étendu (novembre 2026, 2)
  // Processeurs
  "i3-13100f": { q: "processeur Intel Core i3-13100F", must: [/13100f/] },
  "i3-13100": { q: "processeur Intel Core i3-13100", must: [/13100\b/], not: [/13100 ?f/] },
  "i5-13400": { q: "processeur Intel Core i5-13400", must: [/13400\b/], not: [/13400 ?f/] },
  "i5-14500": { q: "processeur Intel Core i5-14500", must: [/14500\b/], not: [/14500 ?t\b/] },
  "i5-12600k": { q: "processeur Intel Core i5-12600K", must: [/12600k\b/] },
  "i5-13600k": { q: "processeur Intel Core i5-13600K", must: [/13600k\b/] },
  "i5-14600k": { q: "processeur Intel Core i5-14600K", must: [/14600k\b/] },
  "i7-12700f": { q: "processeur Intel Core i7-12700F", must: [/12700f\b/] },
  "i7-12700k": { q: "processeur Intel Core i7-12700K", must: [/12700k\b/] },
  "i7-13700k": { q: "processeur Intel Core i7-13700K", must: [/13700k\b/] },
  "i7-14700f": { q: "processeur Intel Core i7-14700F", must: [/14700f\b/] },
  "i9-13900k": { q: "processeur Intel Core i9-13900K", must: [/13900k\b/], not: [/13900ks/] },
  "i9-14900f": { q: "processeur Intel Core i9-14900F", must: [/14900f\b/] },
  "u5-225": { q: "processeur Intel Core Ultra 5 225", must: [/ultra/, /\b225\b/], not: [/225 ?(f|h|u|v)\b/] },
  "u7-265": { q: "processeur Intel Core Ultra 7 265", must: [/ultra/, /\b265\b/], not: [/265 ?(k|kf|f|h|t)\b/] },
  "u7-265f": { q: "processeur Intel Core Ultra 7 265F", must: [/265f\b/] },
  "u9-285": { q: "processeur Intel Core Ultra 9 285", must: [/ultra/, /\b285\b/], not: [/285 ?(k|h|t)\b/] },
  "r5-5500gt": { q: "processeur AMD Ryzen 5 5500GT", must: [/5500 ?gt\b/] },
  "r5-5600xt": { q: "processeur AMD Ryzen 5 5600XT", must: [/5600 ?xt\b/] },
  "r7-5700g": { q: "processeur AMD Ryzen 7 5700G", must: [/5700g\b/] },
  "r7-5800xt": { q: "processeur AMD Ryzen 7 5800XT", must: [/5800 ?xt\b/] },
  "r9-7900x3d": { q: "processeur AMD Ryzen 9 7900X3D", must: [/7900x3d/] },
  "r9-7950x3d": { q: "processeur AMD Ryzen 9 7950X3D", must: [/7950x3d/] },

  // Cartes mères
  "mb-h610-ddr4-matx": { q: "carte mère H610M DDR4 micro ATX", must: [/\bh610m?\b/, /ddr4|\bd4\b/], not: [/itx/], generic: true },
  "mb-h610-ddr5-matx": { q: "carte mère H610M DDR5 micro ATX", must: [/\bh610m?\b/], not: [/ddr4|\bd4\b|itx/], generic: true },
  "mb-z790-ddr4-atx": { q: "carte mère Z790 DDR4 ATX", must: [/\bz790\b/, /ddr4|\bd4\b/], not: [/itx|mini|micro|m-?atx|\bz790m/], generic: true },
  "mb-a520-matx": { q: "carte mère A520M micro ATX AM4", must: [/\ba520m?\b/], not: [/itx/], generic: true },
  "mb-x570-atx": { q: "carte mère X570 ATX AM4", must: [/\bx570s?\b/], not: [/itx|mini|micro|m-?atx/], generic: true },
  "mb-x870e-atx": { q: "carte mère X870E ATX AM5", must: [/\bx870e\b/], not: [/itx|mini|micro|m-?atx/], generic: true },

  // Mémoire vive
  "d4-2x8-3600": { q: "kit mémoire 16 Go 2x8 Go DDR4 3600", must: [/2 ?x ?8|\b16 ?g[ob]\b/, /ddr4/, /3600/], not: [/32 ?g[ob]|1 ?x ?16/] },
  "d4-2x32-3600": { q: "kit mémoire 64 Go 2x32 Go DDR4 3600", must: [/2 ?x ?32|\b64 ?g[ob]\b/, /ddr4/, /3600/], not: [/128 ?g[ob]|\b4 ?x|\b1 ?x ?32/] },
  "d5-1x8-5600": { q: "barrette mémoire 8 Go DDR5 5600 MHz", must: [/\b8 ?g[ob]\b/, /ddr5/], not: [/\d ?x ?\d|\bkit\b|16 ?g[ob]|32 ?g[ob]|\becc\b|rdimm|dell|lenovo|\bhp\b/] },
  "d5-2x16-6400": { q: "kit mémoire 32 Go 2x16 Go DDR5 6400", must: [/2 ?x ?16|\b32 ?g[ob]\b/, /ddr5/, /6400/], not: [/64 ?g[ob]|1 ?x ?32/] },
  "d5-2x64-5600": { q: "kit mémoire 128 Go 2x64 Go DDR5 5600", must: [/2 ?x ?64|\b128 ?g[ob]\b/, /ddr5/], not: [/\b4 ?x|256 ?g[ob]/] },

  // Stockage
  "hdd-1tb": { q: "disque dur interne 3,5 pouces 1 To SATA 7200", must: [/disque dur|\bhdd\b|barracuda|wd blue|seagate|toshiba/, /\b1 ?t[ob]\b|1000 ?g[ob]?\b/, /3[.,]5/], not: [/ssd|externe|portable|2[.,]5/], generic: true },
  "hdd-6tb": { q: "disque dur interne 3,5 pouces 6 To SATA", must: [/disque dur|\bhdd\b|barracuda|ironwolf|wd red|seagate|toshiba/, /\b6 ?t[ob]\b|6000 ?g[ob]?\b/, /3[.,]5/], not: [/ssd|externe|portable|2[.,]5/], generic: true },
  "hdd-16tb": { q: "disque dur interne 3,5 pouces 16 To SATA", must: [/disque dur|\bhdd\b|ironwolf|wd red|exos|seagate|toshiba|ultrastar/, /\b16 ?t[ob]\b|16000 ?g[ob]?\b/, /3[.,]5/], not: [/ssd|externe|portable|2[.,]5/], generic: true },
  // Plateformes ajoutées (novembre 2026, 3)
  "mb-b650e-atx": { q: "carte mère B650E ATX AM5", must: [/\bb650e\b/], not: [/itx|mini|micro|m-?atx|\bb650e?m/], generic: true },
  "mb-x670-atx": { q: "carte mère X670 ATX AM5", must: [/\bx670\b/], not: [/itx|mini|micro|m-?atx|x670e/], generic: true },
  "mb-x670e-atx": { q: "carte mère X670E ATX AM5", must: [/\bx670e\b/], not: [/itx|mini|micro|m-?atx/], generic: true },
  "mb-b840-atx": { q: "carte mère B840 ATX AM5", must: [/\bb840\b/], not: [/itx|mini|micro|m-?atx|\bb840m/], generic: true },
  "mb-b840-matx": { q: "carte mère B840M micro ATX AM5", must: [/\bb840m\b/], not: [/itx/], generic: true },
  "mb-h810-matx": { q: "carte mère H810M micro ATX LGA1851", must: [/\bh810m?\b/], not: [/itx/], generic: true },
  "mb-b550-itx": { q: "carte mère B550 mini ITX AM4", must: [/\bb550i?\b|\bb550-i\b/, /itx|\bb550-?i\b/], generic: true },
  "mb-b650-itx": { q: "carte mère B650 mini ITX AM5", must: [/\bb650e?-?i\b|\bb650e?\b/, /itx|\bb650e?-?i\b/], generic: true },
  "mb-b850-itx": { q: "carte mère B850 mini ITX AM5", must: [/\bb850-?i\b|\bb850\b/, /itx|\bb850-?i\b/], generic: true },
  "mb-x870-itx": { q: "carte mère X870 mini ITX AM5", must: [/\bx870e?-?i\b|\bx870e?\b/, /itx|\bx870e?-?i\b/], generic: true },
  "mb-b760-ddr5-itx": { q: "carte mère B760 mini ITX DDR5", must: [/\bb760-?i\b|\bb760\b/, /itx|\bb760-?i\b/], not: [/ddr4|\bd4\b/], generic: true },
  "mb-z790-itx": { q: "carte mère Z790 mini ITX", must: [/\bz790-?i\b|\bz790\b/, /itx|\bz790-?i\b/], not: [/ddr4|\bd4\b/], generic: true },
  "mb-b860-itx": { q: "carte mère B860 mini ITX", must: [/\bb860-?i\b|\bb860\b/, /itx|\bb860-?i\b/], generic: true },
  // Kits de marque (novembre 2026, 3)
  "k-gs-ripv-d4-2x16-3600": { q: "G.Skill Ripjaws V 32 Go 2x16 Go DDR4 3600", must: [/ripjaws v\b/, /2 ?x ?16|\b32 ?g[ob]\b/, /ddr4/, /3600/], not: [/\b64 ?g[ob]\b|1 ?x ?32|\b4 ?x/] },
  "k-gs-tzneo-d4-2x16-3600": { q: "G.Skill Trident Z Neo 32 Go 2x16 Go DDR4 3600", must: [/trident z neo/, /2 ?x ?16|\b32 ?g[ob]\b/, /ddr4/, /3600/], not: [/\b64 ?g[ob]\b|1 ?x ?32|\b4 ?x/] },
  "k-cor-veng-d5-2x16-6000": { q: "Corsair Vengeance 32 Go 2x16 Go DDR5 6000", must: [/vengeance\b/, /2 ?x ?16|\b32 ?g[ob]\b/, /ddr5/, /6000/], not: [/rgb|lpx|\b64 ?g[ob]\b|1 ?x ?32|\b4 ?x/] },
  "k-cor-vengrgb-d5-2x16-6000": { q: "Corsair Vengeance RGB 32 Go 2x16 Go DDR5 6000", must: [/vengeance rgb/, /2 ?x ?16|\b32 ?g[ob]\b/, /ddr5/, /6000/], not: [/rgb pro|\b64 ?g[ob]\b|1 ?x ?32|\b4 ?x/] },
  "k-gs-flare-d5-2x16-6000": { q: "G.Skill Flare X5 32 Go 2x16 Go DDR5 6000", must: [/flare x5/, /2 ?x ?16|\b32 ?g[ob]\b/, /ddr5/, /6000/], not: [/\b64 ?g[ob]\b|1 ?x ?32|\b4 ?x/] },
  "k-gs-tz5neo-d5-2x16-6000": { q: "G.Skill Trident Z5 Neo RGB 32 Go 2x16 Go DDR5 6000", must: [/trident z5 neo/, /2 ?x ?16|\b32 ?g[ob]\b/, /ddr5/, /6000/], not: [/\b64 ?g[ob]\b|1 ?x ?32|\b4 ?x/] },
  "k-cru-prooc-d5-2x16-6000": { q: "Crucial Pro Overclocking 32 Go 2x16 Go DDR5 6000", must: [/crucial pro/, /overclock|\boc\b|6000/, /2 ?x ?16|\b32 ?g[ob]\b/, /ddr5/, /6000/], not: [/\b64 ?g[ob]\b|1 ?x ?32|\b4 ?x/] },
  "k-pat-venom-d5-2x16-6000": { q: "Patriot Viper Venom 32 Go 2x16 Go DDR5 6000", must: [/viper venom/, /2 ?x ?16|\b32 ?g[ob]\b/, /ddr5/, /6000/], not: [/\b64 ?g[ob]\b|1 ?x ?32|\b4 ?x/] },
};

// Modèles réels de cartes mères (onglet « Carte mère ») : une requête par modèle, construite depuis son nom.
// Chaque mot du nom doit figurer dans l'offre ; les variantes voisines (Wi-Fi, II, MAX, V2, DDR4) sont écartées.
const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const B = String.raw`\b`;
for (const b of BOARD_MODELS) {
  const n = b.name.toLowerCase();
  const words = n.replace(/^(msi|asus|gigabyte|asrock)\s+/, "").split(/\s+/);
  const must = words.map((w) => {
    const core = /^wifi/.test(w) ? w.replace(/^wifi/, "wi-?fi ?") : esc(w).replace(/-/g, "[- ]?");
    return new RegExp(`${B}${core}${B}`);
  });
  const not: string[] = ["itx"];
  if (!/wifi|\bax\b/.test(n)) not.push("wi-?fi", `${B}ax${B}`);
  if (!/\bii\b/.test(n)) not.push(`${B}ii${B}`);
  if (!/\bmax\b/.test(n)) not.push(`${B}max${B}`);
  if (!/\bv2\b/.test(n)) not.push(`${B}v2${B}`);
  if (!/\bplus\b/.test(n)) not.push(`${B}plus${B}`);
  if (b.ramType === "DDR5" && b.socket === "LGA1700") not.push("ddr4", `${B}d4${B}`);
  QUERIES[b.id] = { q: `carte mère ${b.name}`, must, not: [new RegExp(not.join("|"))] };
}
