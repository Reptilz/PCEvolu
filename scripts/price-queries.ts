// Requêtes Google Shopping et filtres pour chaque composant proposé à l'achat.
//
// `must` : expressions qui doivent toutes apparaître dans le titre de l'offre.
// `not`  : expressions qui excluent l'offre (variantes voisines, autres capacités…).
// Les titres sont comparés en minuscules et sans accents.

export interface PriceQuery {
  q: string;
  must: RegExp[];
  not?: RegExp[];
}

/** Exclusions communes à toutes les catégories. */
export const GLOBAL_EXCLUDE = /reconditionn|occasion|d'occasion|seconde main|refurbished|remis a neuf|pieces detachees/;

/** Exclusions par catégorie (PC complets, accessoires…). */
export const CATEGORY_EXCLUDE: Record<string, RegExp> = {
  gpu: /\bpc\b|ordinateur|laptop|portable|waterblock|water block|backplate|support|cable|riser|station/,
  cpu: /\bpc\b|ordinateur|laptop|portable|ventirad|refroidiss|cooler|carte mere|motherboard|\bkit\b|bundle|pack/,
  board: /\bpc\b|ordinateur|\bkit\b|bundle|pack|processeur inclus/,
  ram: /so-?dimm|portable|laptop|notebook|\bpc\b|ordinateur/,
  ssd: /\bpc\b|ordinateur|laptop|portable|externe|boitier|enclosure|adaptateur/,
  psu: /\bpc\b|ordinateur|cable|rallonge|sleeve/,
  cooler: /\bpc\b|ordinateur|pate thermique|kit de fixation|bracket/,
  fans: /\bpc\b|ordinateur/,
  case: /\bpc\b|ordinateur|panneau|filtre|support/,
};

export const QUERIES: Record<string, PriceQuery> = {
  // Cartes graphiques
  "rtx-5060": { q: "carte graphique GeForce RTX 5060 8 Go", must: [/rtx ?5060\b/], not: [/\bti\b/] },
  "rtx-5060ti-16": { q: "carte graphique GeForce RTX 5060 Ti 16 Go", must: [/rtx ?5060 ?ti/, /16 ?g[ob]/] },
  "rtx-5070": { q: "carte graphique GeForce RTX 5070 12 Go", must: [/rtx ?5070\b/], not: [/\bti\b/] },
  "rtx-5070ti": { q: "carte graphique GeForce RTX 5070 Ti 16 Go", must: [/rtx ?5070 ?ti/] },
  "rtx-5080": { q: "carte graphique GeForce RTX 5080 16 Go", must: [/rtx ?5080\b/] },
  "rx-9060xt-16": { q: "carte graphique Radeon RX 9060 XT 16 Go", must: [/9060 ?xt/, /16 ?g[ob]/] },
  "rx-9070": { q: "carte graphique Radeon RX 9070 16 Go", must: [/rx ?9070\b/], not: [/\bxt\b/, /\bgre\b/] },
  "rx-9070xt": { q: "carte graphique Radeon RX 9070 XT 16 Go", must: [/9070 ?xt/] },

  // Processeurs (neufs)
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

  // Cartes mères
  "msi-b550-a-pro": { q: "carte mère MSI B550-A PRO", must: [/b550-?a ?pro/] },
  "msi-b760-p-ddr4": { q: "carte mère MSI PRO B760-P DDR4 II", must: [/b760-?p\b/, /ddr4|d4\b/] },
  "asus-b760m-a-d4": { q: "carte mère ASUS PRIME B760M-A D4", must: [/b760m-?a/, /ddr4|\bd4\b/] },
  "msi-b760-p-ddr5": { q: "carte mère MSI PRO B760-P WIFI DDR5", must: [/b760-?p\b/, /wi-?fi/], not: [/ddr4|\bd4\b/] },
  "msi-b860-p": { q: "carte mère MSI PRO B860-P", must: [/b860-?p\b/] },
  "asus-b860m-a": { q: "carte mère ASUS PRIME B860M-A", must: [/b860m-?a\b/] },
  "msi-b650-p": { q: "carte mère MSI PRO B650-P WIFI", must: [/b650-?p\b/] },
  "gb-b650m-ds3h": { q: "carte mère Gigabyte B650M DS3H", must: [/b650m ?ds3h/] },
  "gb-b850-eagle": { q: "carte mère Gigabyte B850 EAGLE WIFI6E", must: [/b850 ?eagle/] },

  // Mémoire vive
  "d4-1x8-3200": { q: "barrette mémoire 8 Go DDR4 3200 MHz", must: [/\b8 ?g[ob]\b/, /ddr4/, /3200/], not: [/2 ?x|x ?2|\bkit\b|16 ?g[ob]|32 ?g[ob]/] },
  "d4-1x16-3200": { q: "barrette mémoire 16 Go DDR4 3200 MHz", must: [/\b16 ?g[ob]\b/, /ddr4/, /3200/], not: [/2 ?x|x ?2|\bkit\b|32 ?g[ob]/] },
  "d4-2x8-3200": { q: "kit mémoire 16 Go 2x8 Go DDR4 3200 CL16", must: [/2 ?x ?8/, /ddr4/, /3200/] },
  "d4-2x16-3200": { q: "kit mémoire 32 Go 2x16 Go DDR4 3200 CL16", must: [/2 ?x ?16/, /ddr4/, /3200/] },
  "d4-2x32-3200": { q: "kit mémoire 64 Go 2x32 Go DDR4 3200", must: [/2 ?x ?32/, /ddr4/, /3200/] },
  "d5-2x16-6000": { q: "kit mémoire 32 Go 2x16 Go DDR5 6000 CL30", must: [/2 ?x ?16/, /ddr5/, /6000/] },
  "d5-2x32-6000": { q: "kit mémoire 64 Go 2x32 Go DDR5 6000 CL30", must: [/2 ?x ?32/, /ddr5/, /6000/] },

  // Stockage
  "nvme4-1tb": { q: "SSD WD Black SN7100 1 To", must: [/sn7100/, /\b1 ?t[ob]\b|1000 ?go/] },
  "nvme4-2tb": { q: "SSD WD Black SN7100 2 To", must: [/sn7100/, /\b2 ?t[ob]\b|2000 ?go/] },
  "nvme3-1tb": { q: "SSD Crucial P3 1 To NVMe", must: [/\bp3\b/, /\b1 ?t[ob]\b|1000 ?go/], not: [/p3 ?plus/] },
  "nvme3-2tb": { q: "SSD Crucial P3 2 To NVMe", must: [/\bp3\b/, /\b2 ?t[ob]\b|2000 ?go/], not: [/p3 ?plus/] },
  "sata-1tb": { q: "SSD Crucial MX500 1 To SATA", must: [/mx500/, /\b1 ?t[ob]\b|1000 ?go/] },
  "sata-2tb": { q: "SSD Crucial MX500 2 To SATA", must: [/mx500/, /\b2 ?t[ob]\b|2000 ?go/] },

  // Alimentations
  rm650e: { q: "alimentation Corsair RM650e", must: [/rm650e/] },
  rm750e: { q: "alimentation Corsair RM750e", must: [/rm750e/] },
  rm850e: { q: "alimentation Corsair RM850e", must: [/rm850e/] },
  rm1000e: { q: "alimentation Corsair RM1000e", must: [/rm1000e/] },

  // Refroidissement
  "arctic-f36": { q: "ventirad Arctic Freezer 36", must: [/freezer 36/] },
  pa120se: { q: "ventirad Thermalright Peerless Assassin 120 SE", must: [/peerless assassin 120 ?se/] },
  "lf3-360": { q: "watercooling Arctic Liquid Freezer III 360", must: [/liquid freezer iii/, /360/] },
  "p12-5": { q: "ventilateurs Arctic P12 PWM PST Value Pack 5", must: [/p12/, /value ?pack|pack de 5|lot de 5|5 ?pcs|\b5 ?x\b|\(5\)/] },

  // Boîtiers
  "lancool-216": { q: "boîtier Lian Li Lancool 216", must: [/lancool 216/] },
  "pop-air": { q: "boîtier Fractal Design Pop Air", must: [/pop air/], not: [/\bmini\b|\bsilent\b|\bxl\b/] },
};
