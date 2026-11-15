// Catalogue de composants.
//
// - Processeurs : décodés depuis leur nom (cpudb.ts), seuls ceux proposés à l'achat sont listés ici.
// - Cartes graphiques : table de référence 2016 → 2026 (gpudb.ts).
// - Les indices de performance sont des ordres de grandeur, pas des benchmarks précis.
// - Les prix sont indicatifs : ils sont remplacés toutes les 3 semaines par le relevé du marché (data/prices.json).

import type {
  BoardSpec, CaseSpec, ChipsetSpec, CoolerSpec, CpuGen, CpuSpec, FanKit, GpuSpec,
  PsuSpec, RamKit, Socket, SsdSpec, Availability,
} from "./types";
import { cpuFromName, purchasable } from "./cpudb";
import { GPU_TABLE, findGpuSpec } from "./gpudb";
import { KNOWN_BOARDS, findKnownBoard } from "./boards";
import { tr } from "../settings";

/** Date du catalogue en français (gardé pour compatibilité) ; à l'affichage, préférer catalogDate(). */
export const CATALOG_DATE = "novembre 2026";
/** Date du catalogue dans la langue choisie. */
export const catalogDate = () => tr(CATALOG_DATE, "November 2026");
/** Incrémenté à chaque mise à jour du catalogue (le catalogue téléchargé n'est pris que s'il est plus récent). */
export const CATALOG_VERSION = 8;

// ---------------------------------------------------------------------------
// Chipsets : ce qui définit la compatibilité CPU / RAM / PCIe d'une carte mère
// ---------------------------------------------------------------------------

const I6_7: CpuGen[] = ["intel-6", "intel-7"];
const I8_9: CpuGen[] = ["intel-8", "intel-9"];
const I10: CpuGen[] = ["intel-10"];
const I10_11: CpuGen[] = ["intel-10", "intel-11"];
const I12_14: CpuGen[] = ["intel-12", "intel-13", "intel-14"];
const AM4_ALL: CpuGen[] = ["amd-zen1", "amd-zen1plus", "amd-zen2", "amd-zen3"];
const AM5_ALL: CpuGen[] = ["amd-zen4", "amd-zen5"];

const chip = (chipset: string, socket: Socket, ramTypes: ChipsetSpec["ramTypes"], pcieGpu: 3 | 4 | 5, cpuGens: CpuGen[], ramOc: boolean, biosUpdateFor?: CpuGen[]): ChipsetSpec =>
  ({ chipset, socket, ramTypes, pcieGpu, cpuGens, ramOc, biosUpdateFor });

export const CHIPSETS: ChipsetSpec[] = [
  // LGA1150 (4e génération, DDR3)
  ...["H81", "B85", "H87", "Q87"].map((c) => chip(c, "LGA1150", ["DDR3"], 3, ["intel-4"], false)),
  ...["H97", "Z87", "Z97"].map((c) => chip(c, "LGA1150", ["DDR3"], 3, ["intel-4"], c !== "H97")),
  // LGA1151 v1 (6e-7e) et v2 (8e-9e) : même socket, mais processeurs NON interchangeables
  ...["H110", "B150", "H170", "Q170", "B250", "H270", "Q270"].map((c) => chip(c, "LGA1151", ["DDR4"], 3, I6_7, false)),
  ...["Z170", "Z270"].map((c) => chip(c, "LGA1151", ["DDR4"], 3, I6_7, true)),
  ...["H310", "B360", "B365", "H370", "Q370"].map((c) => chip(c, "LGA1151", ["DDR4"], 3, I8_9, false)),
  ...["Z370", "Z390"].map((c) => chip(c, "LGA1151", ["DDR4"], 3, I8_9, true)),
  // LGA1200
  chip("H410", "LGA1200", ["DDR4"], 3, I10, false),
  chip("B460", "LGA1200", ["DDR4"], 3, I10, false),
  chip("H470", "LGA1200", ["DDR4"], 3, I10_11, false),
  chip("Z490", "LGA1200", ["DDR4"], 4, I10_11, true),
  chip("H510", "LGA1200", ["DDR4"], 3, I10_11, false),
  chip("B560", "LGA1200", ["DDR4"], 4, I10_11, true),
  chip("H570", "LGA1200", ["DDR4"], 4, I10_11, true),
  chip("Z590", "LGA1200", ["DDR4"], 4, I10_11, true),
  // LGA1700
  chip("H610", "LGA1700", ["DDR4", "DDR5"], 4, I12_14, false, ["intel-13", "intel-14"]),
  chip("B660", "LGA1700", ["DDR4", "DDR5"], 4, I12_14, true, ["intel-13", "intel-14"]),
  chip("H670", "LGA1700", ["DDR4", "DDR5"], 4, I12_14, true, ["intel-13", "intel-14"]),
  chip("Z690", "LGA1700", ["DDR4", "DDR5"], 5, I12_14, true, ["intel-13", "intel-14"]),
  chip("B760", "LGA1700", ["DDR4", "DDR5"], 4, I12_14, true),
  chip("H770", "LGA1700", ["DDR4", "DDR5"], 4, I12_14, true),
  chip("Z790", "LGA1700", ["DDR4", "DDR5"], 5, I12_14, true),
  // LGA1851
  chip("H810", "LGA1851", ["DDR5"], 4, ["intel-ultra2"], false),
  chip("B860", "LGA1851", ["DDR5"], 5, ["intel-ultra2"], true),
  chip("Z890", "LGA1851", ["DDR5"], 5, ["intel-ultra2"], true),
  // AM4
  // Tableau officiel AMD (amd.com, chipsets AM4) : l'A320 ne prend pas les Ryzen 3000 ; Ryzen 5000 via un BIOS « bêta sélectif ».
  chip("A320", "AM4", ["DDR4"], 3, ["amd-zen1", "amd-zen1plus", "amd-zen3"], false, ["amd-zen3"]),
  chip("B350", "AM4", ["DDR4"], 3, AM4_ALL, true, ["amd-zen2", "amd-zen3"]),
  chip("X370", "AM4", ["DDR4"], 3, AM4_ALL, true, ["amd-zen2", "amd-zen3"]),
  chip("B450", "AM4", ["DDR4"], 3, AM4_ALL, true, ["amd-zen3"]),
  chip("X470", "AM4", ["DDR4"], 3, AM4_ALL, true, ["amd-zen3"]),
  chip("A520", "AM4", ["DDR4"], 3, ["amd-zen2", "amd-zen3"], false),
  chip("B550", "AM4", ["DDR4"], 4, ["amd-zen2", "amd-zen3"], true),
  chip("X570", "AM4", ["DDR4"], 4, ["amd-zen1plus", "amd-zen2", "amd-zen3"], true), // pas de Ryzen 1000 (AMD)
  // AM5
  chip("A620", "AM5", ["DDR5"], 4, AM5_ALL, true, ["amd-zen5"]),
  chip("B650", "AM5", ["DDR5"], 4, AM5_ALL, true, ["amd-zen5"]),
  chip("B650E", "AM5", ["DDR5"], 5, AM5_ALL, true, ["amd-zen5"]),
  chip("X670E", "AM5", ["DDR5"], 5, AM5_ALL, true, ["amd-zen5"]),
  // Port graphique (tableau AMD) : X670 et B850 en PCIe 4.0 (5.0 en option sur certaines cartes ; seul le M.2 5.0 est obligatoire
  // sur B850), B840 en PCIe 4.0 (lignes du chipset en 3.0). X670E / X870 : 5.0.
  chip("X670", "AM5", ["DDR5"], 4, AM5_ALL, true, ["amd-zen5"]),
  chip("B840", "AM5", ["DDR5"], 4, AM5_ALL, true),
  chip("B850", "AM5", ["DDR5"], 4, AM5_ALL, true),
  chip("X870", "AM5", ["DDR5"], 5, AM5_ALL, true),
  chip("X870E", "AM5", ["DDR5"], 5, AM5_ALL, true),
];

// ---------------------------------------------------------------------------
// Processeurs proposés à l'achat (les autres sont reconnus par leur nom, voir cpudb.ts)
// ---------------------------------------------------------------------------

export const CPUS: CpuSpec[] = [
  // Occasion / fin de stock, pour évoluer sans changer de carte mère
  purchasable("Intel Core i7-10700F", "used", 140),
  purchasable("Intel Core i7-10700K", "used", 160),
  purchasable("Intel Core i9-10900F", "used", 190),
  purchasable("Intel Core i9-10900K", "used", 220),
  purchasable("Intel Core i5-11400", "used", 100),
  purchasable("Intel Core i7-11700K", "used", 170),
  purchasable("AMD Ryzen 7 5800X", "used", 140),
  // Neufs : de l'entrée de gamme au très haut de gamme
  purchasable("Intel Core i3-12100F", "new", 90),
  purchasable("Intel Core i3-14100F", "new", 110),
  // Avec puce graphique intégrée : idéaux pour la bureautique, sans carte graphique à acheter
  purchasable("Intel Core i3-12100", "new", 110),
  purchasable("Intel Core i5-12400", "new", 170),
  purchasable("AMD Ryzen 5 5600G", "new", 130),
  purchasable("Intel Core i5-13400F", "new", 150),
  purchasable("Intel Core i5-12600KF", "new", 170),
  purchasable("Intel Core i7-12700KF", "new", 250),
  purchasable("AMD Ryzen 5 5600X", "new", 140),
  purchasable("AMD Ryzen 7 5800X3D", "new", 300),
  purchasable("AMD Ryzen 5 8600G", "new", 190),
  purchasable("AMD Ryzen 7 7700", "new", 270),
  purchasable("AMD Ryzen 7 7700X", "new", 280),
  purchasable("Intel Core i5-12400F", "new", 150),
  purchasable("Intel Core i5-14400F", "new", 165),
  purchasable("Intel Core i5-14600KF", "new", 245),
  purchasable("Intel Core i7-14700KF", "new", 425),
  purchasable("Intel Core i9-14900K", "new", 520),
  purchasable("Intel Core Ultra 5 245KF", "new", 190),
  purchasable("Intel Core Ultra 7 265KF", "new", 340),
  purchasable("Intel Core Ultra 9 285K", "new", 600),
  purchasable("AMD Ryzen 5 5500", "new", 90),
  purchasable("AMD Ryzen 5 5600", "new", 135),
  purchasable("AMD Ryzen 7 5700X", "new", 170),
  purchasable("AMD Ryzen 7 5700X3D", "new", 230),
  purchasable("AMD Ryzen 5 7500F", "new", 160),
  purchasable("AMD Ryzen 5 7600", "new", 180),
  purchasable("AMD Ryzen 5 9600X", "new", 190),
  purchasable("AMD Ryzen 7 9700X", "new", 300),
  purchasable("AMD Ryzen 7 7800X3D", "new", 320),
  purchasable("AMD Ryzen 7 9800X3D", "new", 490),
  purchasable("AMD Ryzen 9 9900X", "new", 400),
  purchasable("AMD Ryzen 9 9950X", "new", 560),
  purchasable("AMD Ryzen 9 9950X3D", "new", 700),
  // Élargissement de la gamme (novembre 2026)
  purchasable("Intel Core i5-14400", "new", 190),
  purchasable("Intel Core i5-13600KF", "new", 230),
  purchasable("Intel Core i7-13700KF", "new", 330),
  purchasable("Intel Core i7-14700K", "new", 400),
  purchasable("Intel Core i9-14900KF", "new", 480),
  purchasable("Intel Core Ultra 5 225F", "new", 170),
  purchasable("Intel Core Ultra 5 245K", "new", 220),
  purchasable("Intel Core Ultra 7 265K", "new", 330),
  purchasable("AMD Ryzen 5 5600GT", "new", 120),
  purchasable("AMD Ryzen 5 7600X", "new", 200),
  purchasable("AMD Ryzen 5 8500G", "new", 150),
  purchasable("AMD Ryzen 7 8700G", "new", 280),
  purchasable("AMD Ryzen 5 9600", "new", 200),
  purchasable("AMD Ryzen 9 7900", "new", 360),
  purchasable("AMD Ryzen 9 7900X", "new", 380),
  purchasable("AMD Ryzen 9 9900X3D", "new", 600),
  // Catalogue étendu (novembre 2026, 2) : retirés ensuite si le relevé ne trouve plus assez d'offres neuves.
  purchasable("Intel Core i3-13100F", "new", 145),
  purchasable("Intel Core i3-13100", "new", 140),
  purchasable("Intel Core i5-13400", "new", 178),
  purchasable("Intel Core i5-14500", "new", 280),
  purchasable("Intel Core i5-12600K", "new", 226),
  purchasable("Intel Core i5-13600K", "new", 327),
  purchasable("Intel Core i5-14600K", "new", 261),
  purchasable("Intel Core i7-12700F", "new", 259),
  purchasable("Intel Core i7-12700K", "new", 319),
  purchasable("Intel Core i7-13700K", "new", 319),
  purchasable("Intel Core i7-14700F", "new", 340),
  purchasable("Intel Core i9-13900K", "new", 562),
  purchasable("Intel Core i9-14900F", "new", 492),
  purchasable("Intel Core Ultra 5 225", "new", 210),
  purchasable("Intel Core Ultra 7 265", "new", 417),
  purchasable("Intel Core Ultra 7 265F", "new", 375),
  purchasable("Intel Core Ultra 9 285", "new", 634),
  purchasable("AMD Ryzen 5 5500GT", "new", 174),
  purchasable("AMD Ryzen 5 5600XT", "new", 178),
  purchasable("AMD Ryzen 7 5700G", "new", 220),
  purchasable("AMD Ryzen 7 5800XT", "new", 200),
  purchasable("AMD Ryzen 9 7900X3D", "new", 554),
  purchasable("AMD Ryzen 9 7950X3D", "new", 725),
];

// ---------------------------------------------------------------------------
// Cartes graphiques (table complète dans gpudb.ts)
// ---------------------------------------------------------------------------

export const GPUS: GpuSpec[] = GPU_TABLE;

// ---------------------------------------------------------------------------
// Cartes mères (modèles connus + modèles proposés en cas de changement de plateforme)
// ---------------------------------------------------------------------------

function board(
  id: string, name: string, socket: Socket, chipset: string, formFactor: BoardSpec["formFactor"], ramType: BoardSpec["ramType"],
  o: { slots?: number; maxGb: number; m2: number; pcie: 3 | 4 | 5; avail?: Availability; price?: number; note?: string; match?: RegExp },
): BoardSpec {
  return {
    kind: "board", id, name, socket, chipset, formFactor, ramType, ramSlots: o.slots ?? 4, maxRamGb: o.maxGb,
    m2Slots: o.m2, pcieGpu: o.pcie, availability: o.avail ?? null, price: o.price, note: o.note, match: o.match,
  };
}

export const BOARDS: BoardSpec[] = [
  // Les cartes réellement installées sont reconnues grâce à la base de boards/ (73 modèles relevés chez les fabricants).

  // Proposées pour un changement de plateforme : génériques par chipset et format.
  // Les cartes d'un même chipset se valent pour la compatibilité ; le prix est la médiane du marché.
  board("mb-b760-ddr4-atx", "Carte mère B760 DDR4 ATX", "LGA1700", "B760", "ATX", "DDR4", { maxGb: 128, m2: 2, pcie: 4, avail: "new", price: 130, note: "Garde ta RAM DDR4 actuelle." }),
  board("mb-b760-ddr4-matx", "Carte mère B760M DDR4 (micro-ATX)", "LGA1700", "B760", "mATX", "DDR4", { maxGb: 128, m2: 2, pcie: 4, avail: "new", price: 115, note: "Garde ta RAM DDR4 actuelle." }),
  board("mb-b760-ddr5-atx", "Carte mère B760 DDR5 ATX", "LGA1700", "B760", "ATX", "DDR5", { maxGb: 192, m2: 2, pcie: 4, avail: "new", price: 150 }),
  board("mb-b760-ddr5-matx", "Carte mère B760M DDR5 (micro-ATX)", "LGA1700", "B760", "mATX", "DDR5", { maxGb: 192, m2: 2, pcie: 4, avail: "new", price: 130 }),
  board("mb-b860-atx", "Carte mère B860 ATX", "LGA1851", "B860", "ATX", "DDR5", { maxGb: 256, m2: 3, pcie: 5, avail: "new", price: 185 }),
  board("mb-b860-matx", "Carte mère B860M (micro-ATX)", "LGA1851", "B860", "mATX", "DDR5", { maxGb: 256, m2: 2, pcie: 5, avail: "new", price: 160 }),
  board("mb-b550-atx", "Carte mère B550 ATX", "AM4", "B550", "ATX", "DDR4", { maxGb: 128, m2: 2, pcie: 4, avail: "new", price: 125 }),
  board("mb-b550-matx", "Carte mère B550M (micro-ATX)", "AM4", "B550", "mATX", "DDR4", { maxGb: 128, m2: 2, pcie: 4, avail: "new", price: 105 }),
  board("mb-a620-matx", "Carte mère A620M (micro-ATX, entrée de gamme)", "AM5", "A620", "mATX", "DDR5", { slots: 2, maxGb: 96, m2: 1, pcie: 4, avail: "new", price: 100, note: "Entrée de gamme : 2 emplacements RAM, à réserver aux processeurs 65 W." }),
  board("mb-b650-atx", "Carte mère B650 ATX", "AM5", "B650", "ATX", "DDR5", { maxGb: 192, m2: 2, pcie: 4, avail: "new", price: 160, note: "Choisis un modèle avec bouton de mise à jour du BIOS sans processeur." }),
  board("mb-b650-matx", "Carte mère B650M (micro-ATX)", "AM5", "B650", "mATX", "DDR5", { maxGb: 192, m2: 2, pcie: 4, avail: "new", price: 130, note: "Choisis un modèle avec bouton de mise à jour du BIOS sans processeur." }),
  board("mb-b850-atx", "Carte mère B850 ATX", "AM5", "B850", "ATX", "DDR5", { maxGb: 256, m2: 3, pcie: 4, avail: "new", price: 200 }),
  board("mb-b850-matx", "Carte mère B850M (micro-ATX)", "AM5", "B850", "mATX", "DDR5", { maxGb: 256, m2: 2, pcie: 4, avail: "new", price: 170 }),
  board("mb-x870-atx", "Carte mère X870 ATX", "AM5", "X870", "ATX", "DDR5", { maxGb: 256, m2: 3, pcie: 5, avail: "new", price: 260 }),
  board("mb-z790-atx", "Carte mère Z790 ATX (DDR5)", "LGA1700", "Z790", "ATX", "DDR5", { maxGb: 192, m2: 4, pcie: 5, avail: "new", price: 220 }),
  board("mb-z890-atx", "Carte mère Z890 ATX", "LGA1851", "Z890", "ATX", "DDR5", { maxGb: 256, m2: 4, pcie: 5, avail: "new", price: 280 }),
  // Catalogue étendu (novembre 2026, 2). H610 et A520 : entrée de gamme, réservées aux processeurs sobres (voir platformFor).
  board("mb-h610-ddr4-matx", "Carte mère H610M DDR4 (micro-ATX, entrée de gamme)", "LGA1700", "H610", "mATX", "DDR4", { slots: 2, maxGb: 64, m2: 1, pcie: 4, avail: "new", price: 85, note: "Entrée de gamme : 2 emplacements RAM, à réserver aux processeurs 65 W." }),
  board("mb-h610-ddr5-matx", "Carte mère H610M DDR5 (micro-ATX, entrée de gamme)", "LGA1700", "H610", "mATX", "DDR5", { slots: 2, maxGb: 96, m2: 1, pcie: 4, avail: "new", price: 66, note: "Entrée de gamme : 2 emplacements RAM, à réserver aux processeurs 65 W." }),
  board("mb-z790-ddr4-atx", "Carte mère Z790 DDR4 ATX", "LGA1700", "Z790", "ATX", "DDR4", { maxGb: 128, m2: 4, pcie: 5, avail: "new", price: 314, note: "Garde ta RAM DDR4 actuelle." }),
  board("mb-a520-matx", "Carte mère A520M (micro-ATX, entrée de gamme)", "AM4", "A520", "mATX", "DDR4", { slots: 2, maxGb: 64, m2: 1, pcie: 3, avail: "new", price: 76, note: "Entrée de gamme : 2 emplacements RAM, à réserver aux processeurs 65 W." }),
  board("mb-x570-atx", "Carte mère X570 ATX", "AM4", "X570", "ATX", "DDR4", { maxGb: 128, m2: 2, pcie: 4, avail: "new", price: 180 }),
  board("mb-x870e-atx", "Carte mère X870E ATX", "AM5", "X870E", "ATX", "DDR5", { maxGb: 256, m2: 4, pcie: 5, avail: "new", price: 443 }),
  // Catalogue étendu (novembre 2026, 3) : tous les chipsets vendus neufs, et le format mini-ITX.
  board("mb-b650e-atx", "Carte mère B650E ATX", "AM5", "B650E", "ATX", "DDR5", { maxGb: 192, m2: 3, pcie: 5, avail: "new", price: 230 }),
  board("mb-x670-atx", "Carte mère X670 ATX", "AM5", "X670", "ATX", "DDR5", { maxGb: 192, m2: 3, pcie: 4, avail: "new", price: 220 }),
  board("mb-x670e-atx", "Carte mère X670E ATX", "AM5", "X670E", "ATX", "DDR5", { maxGb: 192, m2: 4, pcie: 5, avail: "new", price: 280 }),
  board("mb-b840-atx", "Carte mère B840 ATX", "AM5", "B840", "ATX", "DDR5", { maxGb: 256, m2: 2, pcie: 4, avail: "new", price: 140 }),
  board("mb-b840-matx", "Carte mère B840M (micro-ATX)", "AM5", "B840", "mATX", "DDR5", { maxGb: 256, m2: 2, pcie: 4, avail: "new", price: 115 }),
  board("mb-h810-matx", "Carte mère H810M (micro-ATX, entrée de gamme)", "LGA1851", "H810", "mATX", "DDR5", { slots: 2, maxGb: 128, m2: 1, pcie: 4, avail: "new", price: 110, note: "Entrée de gamme : 2 emplacements RAM, à réserver aux processeurs 65 W." }),
  board("mb-b550-itx", "Carte mère B550 mini-ITX", "AM4", "B550", "ITX", "DDR4", { slots: 2, maxGb: 64, m2: 2, pcie: 4, avail: "new", price: 170, note: "Format mini-ITX : 2 emplacements RAM, pour les petits boîtiers." }),
  board("mb-b650-itx", "Carte mère B650 mini-ITX", "AM5", "B650", "ITX", "DDR5", { slots: 2, maxGb: 96, m2: 2, pcie: 4, avail: "new", price: 220, note: "Format mini-ITX : 2 emplacements RAM, pour les petits boîtiers." }),
  board("mb-b850-itx", "Carte mère B850 mini-ITX", "AM5", "B850", "ITX", "DDR5", { slots: 2, maxGb: 128, m2: 2, pcie: 4, avail: "new", price: 240, note: "Format mini-ITX : 2 emplacements RAM, pour les petits boîtiers." }),
  board("mb-x870-itx", "Carte mère X870 mini-ITX", "AM5", "X870", "ITX", "DDR5", { slots: 2, maxGb: 128, m2: 2, pcie: 5, avail: "new", price: 330, note: "Format mini-ITX : 2 emplacements RAM, pour les petits boîtiers." }),
  board("mb-b760-ddr5-itx", "Carte mère B760 DDR5 mini-ITX", "LGA1700", "B760", "ITX", "DDR5", { slots: 2, maxGb: 96, m2: 2, pcie: 4, avail: "new", price: 180, note: "Format mini-ITX : 2 emplacements RAM, pour les petits boîtiers." }),
  board("mb-z790-itx", "Carte mère Z790 mini-ITX", "LGA1700", "Z790", "ITX", "DDR5", { slots: 2, maxGb: 96, m2: 2, pcie: 5, avail: "new", price: 300, note: "Format mini-ITX : 2 emplacements RAM, pour les petits boîtiers." }),
  board("mb-b860-itx", "Carte mère B860 mini-ITX", "LGA1851", "B860", "ITX", "DDR5", { slots: 2, maxGb: 128, m2: 2, pcie: 5, avail: "new", price: 230, note: "Format mini-ITX : 2 emplacements RAM, pour les petits boîtiers." }),
];

/**
 * Prix de référence des modèles réels de la base (novembre 2026), remplacés par le relevé.
 * Seuls les modèles d'un chipset vendu neuf sont proposés à l'achat.
 */
const MODEL_PRICES: Record<string, number> = {
  "MSI B550-A PRO": 120, "MSI MAG B550 TOMAHAWK": 150, "ASUS TUF GAMING B550-PLUS": 140, "ASUS ROG STRIX B550-F GAMING": 180,
  "Gigabyte B550 AORUS ELITE V2": 140, "Gigabyte B550 GAMING X V2": 115, "MSI B550M PRO-VDH WIFI": 115, "ASUS PRIME B550M-A": 105,
  "Gigabyte B550M DS3H": 90, "MSI A520M-A PRO": 70, "MSI MAG X570 TOMAHAWK WIFI": 190, "ASUS TUF GAMING X570-PLUS": 180,
  "Gigabyte X570 AORUS ELITE": 180,
  "MSI PRO B650-P WIFI": 160, "MSI MAG B650 TOMAHAWK WIFI": 200, "ASUS TUF GAMING B650-PLUS WIFI": 190, "Gigabyte B650 AORUS ELITE AX V2": 190,
  "Gigabyte B650 EAGLE AX": 160, "MSI PRO B650M-A WIFI": 150, "ASUS PRIME B650M-A II": 140, "Gigabyte B650M DS3H": 120,
  "ASRock B650M Pro RS WiFi": 140, "MSI PRO A620M-E": 80, "Gigabyte A620M H": 85, "MSI MAG X670E TOMAHAWK WIFI": 270,
  "MSI MAG B850 TOMAHAWK MAX WIFI": 240, "ASUS TUF GAMING B850-PLUS WIFI": 220, "Gigabyte B850 AORUS ELITE WIFI7": 230, "ASRock B850 Pro RS": 170,
  "MSI MAG X870 TOMAHAWK WIFI": 290, "ASUS TUF GAMING X870-PLUS WIFI": 280, "MSI B840 GAMING PLUS WIFI": 150,
  "ASUS ROG STRIX B650E-F GAMING WIFI": 260, "ASUS PRIME X670-P": 220, "Gigabyte X870E AORUS ELITE WIFI7": 380,
  "MSI PRO B760-P DDR4": 130, "MSI PRO B760-P DDR4 II": 130, "MSI MAG B760 TOMAHAWK WIFI DDR4": 180, "ASUS PRIME B760-PLUS D4": 135,
  "ASUS TUF GAMING B760-PLUS WIFI D4": 180, "Gigabyte B760 GAMING X DDR4": 140, "Gigabyte B760 GAMING X AX DDR4": 160,
  "MSI PRO B760-P WIFI": 160, "MSI PRO B760-P II": 140, "MSI MAG B760 TOMAHAWK WIFI": 190, "ASUS PRIME B760-PLUS": 145,
  "ASUS TUF GAMING B760-PLUS WIFI": 190, "Gigabyte B760 GAMING X": 150, "Gigabyte B760 GAMING X AX": 170,
  "MSI PRO B760M-A WIFI": 150, "ASRock B760M Pro RS": 120, "Gigabyte B760M DS3H": 115, "MSI PRO B760M-A DDR4": 125,
  "ASRock B760M Pro RS/D4": 115, "Gigabyte B760M DS3H DDR4": 110, "MSI PRO Z790-P WIFI": 220, "ASUS TUF GAMING Z790-PLUS WIFI": 260,
  "MSI PRO Z790-P WIFI DDR4": 210, "ASUS TUF GAMING Z790-PLUS WIFI D4": 250, "Gigabyte H610M S2H DDR4": 85, "Gigabyte H610M S2H": 85,
  "MSI PRO B860-P": 170, "ASUS PRIME B860-PLUS WIFI": 190, "Gigabyte B860 EAGLE WIFI6E": 180, "MSI MAG Z890 TOMAHAWK WIFI": 320,
};

/** Modèles réels proposés à l'achat (onglet « Carte mère »), chacun avec son propre prix relevé. */
export const BOARD_MODELS: BoardSpec[] = KNOWN_BOARDS.filter((b) => MODEL_PRICES[b.name] != null).map((b) => ({
  ...b,
  availability: "new" as const,
  price: MODEL_PRICES[b.name],
}));


// ---------------------------------------------------------------------------
// RAM, stockage, alimentations, refroidissement, boîtiers
// ---------------------------------------------------------------------------

const ram = (id: string, name: string, type: RamKit["type"], sticks: number, gbPerStick: number, mts: number, price: number, series?: string): RamKit =>
  ({ kind: "ram", id, name, type, sticks, gbPerStick, mts, price, ...(series ? { series } : {}) });

/** Kit de marque (2 barrettes) : la gamme apparaît dans le titre de la proposition. */
const kit = (id: string, series: string, type: RamKit["type"], gbPerStick: number, mts: number, cl: number, price: number): RamKit =>
  ram(id, `${series} 2 × ${gbPerStick} Go ${type}-${mts} CL${cl}`, type, 2, gbPerStick, mts, price, series);

export const RAM_KITS: RamKit[] = [
  ram("d4-1x8-3200", "Crucial 8 Go DDR4-3200", "DDR4", 1, 8, 3200, 25),
  ram("d4-1x16-3200", "Crucial 16 Go DDR4-3200", "DDR4", 1, 16, 3200, 45),
  ram("d4-2x8-3200", "Kit 2 × 8 Go DDR4-3200 CL16", "DDR4", 2, 8, 3200, 50),
  ram("d4-2x16-3200", "Kit 2 × 16 Go DDR4-3200 CL16", "DDR4", 2, 16, 3200, 85),
  ram("d4-2x32-3200", "Kit 2 × 32 Go DDR4-3200 CL16", "DDR4", 2, 32, 3200, 165),
  ram("d4-1x32-3200", "Barrette 32 Go DDR4-3200", "DDR4", 1, 32, 3200, 110),
  ram("d4-2x16-3600", "Kit 2 × 16 Go DDR4-3600 CL18", "DDR4", 2, 16, 3600, 95),
  ram("d5-1x16-5600", "Barrette 16 Go DDR5-5600", "DDR5", 1, 16, 5600, 70),
  ram("d5-1x32-5600", "Barrette 32 Go DDR5-5600", "DDR5", 1, 32, 5600, 130),
  ram("d5-2x8-5600", "Kit 2 × 8 Go DDR5-5600", "DDR5", 2, 8, 5600, 80),
  ram("d5-2x16-5600", "Kit 2 × 16 Go DDR5-5600", "DDR5", 2, 16, 5600, 130),
  ram("d5-2x16-6000", "Kit 2 × 16 Go DDR5-6000 CL30", "DDR5", 2, 16, 6000, 140),
  ram("d5-2x32-5600", "Kit 2 × 32 Go DDR5-5600", "DDR5", 2, 32, 5600, 240),
  ram("d5-2x32-6000", "Kit 2 × 32 Go DDR5-6000 CL30", "DDR5", 2, 32, 6000, 260),
  ram("d5-2x48-6000", "Kit 2 × 48 Go DDR5-6000", "DDR5", 2, 48, 6000, 420),
  // Catalogue étendu (novembre 2026, 2)
  ram("d4-2x8-3600", "Kit 2 × 8 Go DDR4-3600 CL18", "DDR4", 2, 8, 3600, 204),
  ram("d4-2x32-3600", "Kit 2 × 32 Go DDR4-3600 CL18", "DDR4", 2, 32, 3600, 747),
  ram("d5-1x8-5600", "Barrette 8 Go DDR5-5600", "DDR5", 1, 8, 5600, 174),
  ram("d5-2x16-6400", "Kit 2 × 16 Go DDR5-6400 CL32", "DDR5", 2, 16, 6400, 610),
  ram("d5-2x64-5600", "Kit 2 × 64 Go DDR5-5600", "DDR5", 2, 64, 5600, 2869),
  // Kits de marque (novembre 2026, 3) : seuls ceux dont le prix se relève de façon fiable sur Google Shopping.
  kit("k-gs-ripv-d4-2x16-3600", "G.Skill Ripjaws V", "DDR4", 16, 3600, 18, 340),
  kit("k-gs-tzneo-d4-2x16-3600", "G.Skill Trident Z Neo", "DDR4", 16, 3600, 16, 380),
  kit("k-cor-veng-d5-2x16-6000", "Corsair Vengeance", "DDR5", 16, 6000, 30, 640),
  kit("k-cor-vengrgb-d5-2x16-6000", "Corsair Vengeance RGB", "DDR5", 16, 6000, 30, 720),
  kit("k-gs-flare-d5-2x16-6000", "G.Skill Flare X5", "DDR5", 16, 6000, 30, 640),
  kit("k-gs-tz5neo-d5-2x16-6000", "G.Skill Trident Z5 Neo RGB", "DDR5", 16, 6000, 30, 720),
  kit("k-cru-prooc-d5-2x16-6000", "Crucial Pro Overclocking", "DDR5", 16, 6000, 36, 640),
  kit("k-pat-venom-d5-2x16-6000", "Patriot Viper Venom", "DDR5", 16, 6000, 30, 640),
];

/**
 * Gammes courantes, proposées comme modèles sur les kits génériques : à capacité et vitesse égales, elles se valent
 * en usage. Leur prix exact se relève mal (titres d'annonces tronqués), d'où le prix de la catégorie.
 */
export const ramSeries = (type: RamKit["type"]): { name: string; why: string[] }[] => ({
  DDR3: [],
  DDR4: [
    { name: "Kingston FURY Beast", why: [tr("ex-HyperX Fury", "formerly HyperX Fury"), tr("dissipateur bas, passe sous tous les ventirads", "low heatsink, fits under any CPU cooler")] },
    { name: "Corsair Vengeance LPX", why: [tr("profil bas", "low profile"), tr("très répandue", "very common")] },
    { name: "G.Skill Ripjaws V", why: [tr("bon rapport qualité/prix", "good value")] },
    { name: "Crucial Pro", why: [tr("sobre, sans éclairage", "plain, no lighting")] },
    { name: "Kingston FURY Renegade", why: [tr("ex-HyperX Predator", "formerly HyperX Predator"), tr("haut de gamme", "high-end")] },
    { name: "Corsair Vengeance RGB Pro", why: [tr("éclairage RGB", "RGB lighting")] },
  ],
  DDR5: [
    { name: "Kingston FURY Beast", why: [tr("ex-HyperX Fury", "formerly HyperX Fury"), tr("profils Intel XMP et AMD EXPO", "Intel XMP and AMD EXPO profiles")] },
    { name: "Corsair Vengeance", why: [tr("très répandue", "very common")] },
    { name: "G.Skill Flare X5", why: [tr("pensée pour AMD (EXPO)", "designed for AMD (EXPO)"), tr("profil bas", "low profile")] },
    { name: "Crucial Pro", why: [tr("sobre, sans éclairage", "plain, no lighting")] },
    { name: "TeamGroup T-Force Delta RGB", why: [tr("éclairage RGB", "RGB lighting")] },
    { name: "Kingston FURY Renegade", why: [tr("ex-HyperX Predator", "formerly HyperX Predator"), tr("haut de gamme", "high-end")] },
  ],
})[type];

const ssd = (id: string, name: string, iface: SsdSpec["iface"], tb: number, price: number): SsdSpec => ({ kind: "ssd", id, name, iface, tb, price });

// Les SSD sont interchangeables : on raisonne par type et capacité (prix = médiane du marché),
// avec des exemples de modèles. Les SSD PCIe 3.0 ont quasiment disparu du neuf : le NVMe courant est en PCIe 4.0.
export const SSDS: SsdSpec[] = [
  ssd("nvme-500gb", "SSD NVMe M.2 500 Go (ex. Kingston NV3, Crucial P3 Plus)", "NVMe4", 0.5, 90),
  ssd("nvme-1tb", "SSD NVMe M.2 1 To (ex. Kingston NV3, WD SN7100)", "NVMe4", 1, 170),
  ssd("nvme-2tb", "SSD NVMe M.2 2 To (ex. Kingston NV3, WD SN7100)", "NVMe4", 2, 300),
  ssd("nvme-4tb", "SSD NVMe M.2 4 To (ex. WD SN7100, Lexar NM790)", "NVMe4", 4, 600),
  // PCIe 5.0 : ≈ 12 000 Mo/s, mais seulement sur un emplacement M.2 PCIe 5.0 (cartes AM5 / LGA1851 récentes). Gain peu visible en jeu.
  ssd("nvme5-1tb", "SSD NVMe PCIe 5.0 1 To (ex. Crucial T705, Samsung 9100 Pro)", "NVMe5", 1, 200),
  ssd("nvme5-4tb", "SSD NVMe PCIe 5.0 4 To (ex. Crucial T705, Samsung 9100 Pro)", "NVMe5", 4, 600),
  ssd("nvme5-2tb", "SSD NVMe PCIe 5.0 2 To (ex. Samsung 9100 Pro, Crucial T705)", "NVMe5", 2, 300),
  ssd("sata-500gb", "SSD SATA 2,5\" 500 Go (ex. Crucial MX500, Samsung 870 EVO)", "SATA", 0.5, 80),
  ssd("sata-1tb", "SSD SATA 2,5\" 1 To (ex. Crucial MX500)", "SATA", 1, 150),
  ssd("sata-2tb", "SSD SATA 2,5\" 2 To (ex. Crucial MX500)", "SATA", 2, 280),
  // Disques durs : beaucoup de place pour pas cher, pour stocker (photos, vidéos, sauvegardes), pas pour Windows ni les jeux.
  ssd("hdd-2tb", "Disque dur 3,5\" 2 To (ex. Seagate BarraCuda, WD Blue)", "HDD", 2, 200),
  ssd("hdd-4tb", "Disque dur 3,5\" 4 To (ex. Seagate BarraCuda, WD Blue)", "HDD", 4, 250),
  ssd("hdd-8tb", "Disque dur 3,5\" 8 To (ex. Seagate BarraCuda, WD Red Plus)", "HDD", 8, 330),
  // Catalogue étendu (novembre 2026, 2)
  ssd("sata-4tb", "SSD SATA 2,5\" 4 To (ex. Samsung 870 EVO, Crucial MX500)", "SATA", 4, 370),
  ssd("hdd-1tb", "Disque dur 3,5\" 1 To (ex. Seagate BarraCuda, WD Blue)", "HDD", 1, 52),
  ssd("hdd-6tb", "Disque dur 3,5\" 6 To (ex. Seagate IronWolf, WD Red Plus)", "HDD", 6, 341),
  ssd("hdd-16tb", "Disque dur 3,5\" 16 To (ex. Seagate IronWolf Pro, Toshiba MG08)", "HDD", 16, 973),
];

const psu = (id: string, name: string, watts: number, atx3: boolean, native12v2x6: boolean, pcie8pin: number, price: number): PsuSpec =>
  ({ kind: "psu", id, name, watts, atx3, native12v2x6, pcie8pin, price });

// Génériques par puissance (prix = médiane du marché). À partir de 650 W : 80+ Gold, ATX 3.x,
// câble 12V-2x6 natif pour les cartes graphiques récentes.
export const PSUS: PsuSpec[] = [
  psu("psu-550", "Alimentation 550 W 80+ Bronze (ex. be quiet! System Power, Corsair CX)", 550, false, false, 2, 60),
  psu("psu-650-bronze", "Alimentation 650 W 80+ Bronze (sans câble 12V-2x6)", 650, false, false, 2, 65),
  psu("psu-750-bronze", "Alimentation 750 W 80+ Bronze (sans câble 12V-2x6)", 750, false, false, 2, 75),
  // Exemples vérifiés sur les fiches fabricants (novembre 2026) :
  // - Corsair RMe « 2025 » (ATX 3.1, câble 12V-2x6 natif) : RM650e CP-9020302, RM750e CP-9020295, RM850e CP-9020296, RM1000e CP-9020297.
  //   Les RMe « 2023 » portent le même nom mais passent par un câble 2 × 8 broches → 12V-2x6.
  // - MSI MAG A850GL PCIE5 : 1 connecteur 16 broches + 4 × 8 broches. La MAG A650GL sans « PCIE5 » n'a PAS de 16 broches.
  psu("psu-650", "Alimentation 650 W 80+ Gold avec câble 12V-2x6 (ex. Corsair RM650e modèle 2025)", 650, true, true, 2, 90),
  psu("psu-750", "Alimentation 750 W 80+ Gold avec câble 12V-2x6 (ex. Corsair RM750e modèle 2025)", 750, true, true, 3, 110),
  psu("psu-850", "Alimentation 850 W 80+ Gold avec câble 12V-2x6 (ex. Corsair RM850e 2025, MSI MAG A850GL PCIE5)", 850, true, true, 3, 130),
  psu("psu-1000", "Alimentation 1000 W 80+ Gold avec câble 12V-2x6 (ex. Corsair RM1000e modèle 2025)", 1000, true, true, 4, 170),
  psu("psu-1200", "Alimentation 1200 W 80+ Gold avec câble 12V-2x6", 1200, true, true, 4, 230),
];

const cooler = (id: string, name: string, type: CoolerSpec["type"], sockets: Socket[], capacityW: number, price: number): CoolerSpec =>
  ({ kind: "cooler", id, name, type, sockets, capacityW, price });

// Hauteurs, sockets et radiateur vérifiés sur les fiches Arctic et Thermalright (novembre 2026).
// Ni Arctic ni Thermalright ne publient de capacité en watts : capacityW est une estimation prudente de PCEvolu.
export const COOLERS: CoolerSpec[] = [
  { ...cooler("arctic-f36", "Arctic Freezer 36", "air", ["LGA1700", "LGA1851", "AM4", "AM5"], 180, 32), heightMm: 159 },
  { ...cooler("pa120se", "Thermalright Peerless Assassin 120 SE", "air", ["LGA1151", "LGA1200", "LGA1700", "LGA1851", "AM4", "AM5"], 240, 40), heightMm: 155 },
  { ...cooler("lf3-360", "Arctic Liquid Freezer III 360", "aio", ["LGA1700", "LGA1851", "AM4", "AM5"], 300, 100), radiatorMm: 360 },
  // Ajouts vérifiés sur les fiches DeepCool, be quiet!, Thermalright, Noctua et Arctic (novembre 2026).
  // Capacité : seul be quiet! publie un chiffre (Pure Rock 3 : 190 W) ; les autres sont des estimations prudentes de PCEvolu.
  { ...cooler("nh-l9a-am5", "Noctua NH-L9a-AM5 (bas profil)", "air", ["AM5"], 65, 50), heightMm: 37 },
  { ...cooler("nh-l9i-17xx", "Noctua NH-L9i-17xx (bas profil)", "air", ["LGA1700", "LGA1851"], 65, 50), heightMm: 37 },
  { ...cooler("ax120-rse", "Thermalright Assassin X 120 Refined SE", "air", ["LGA1151", "LGA1200", "LGA1700", "LGA1851", "AM4", "AM5"], 180, 20), heightMm: 148 },
  { ...cooler("ak400-digital", "DeepCool AK400 DIGITAL", "air", ["LGA1151", "LGA1200", "LGA1700", "LGA1851", "AM4", "AM5"], 190, 45), heightMm: 156 },
  { ...cooler("pure-rock-3", "be quiet! Pure Rock 3", "air", ["LGA1151", "LGA1200", "LGA1700", "LGA1851", "AM4", "AM5"], 190, 30), heightMm: 154 },
  { ...cooler("nh-d15-g2", "Noctua NH-D15 G2", "air", ["LGA1151", "LGA1200", "LGA1700", "LGA1851", "AM4", "AM5"], 280, 150), heightMm: 168 },
];

/** Capacité de refroidissement selon ce que l'utilisateur déclare avoir. */
export const COOLER_CAPACITY: Record<string, number> = {
  stock: 95,
  "tower-single": 160,
  "tower-dual": 230,
  "aio-240": 230,
  "aio-360": 290,
};

export const FAN_KITS: FanKit[] = [
  { kind: "fans", id: "p12-5", name: "Arctic P12 PWM PST (lot de 5)", count: 5, price: 30 },
  { kind: "fans", id: "p14-5", name: "Arctic P14 PWM PST (lot de 5, 140 mm)", count: 5, price: 40 },
];

// Longueur max de carte graphique et ventilateurs fournis vérifiés sur les fiches Lian Li et Fractal Design.
export const CASES: CaseSpec[] = [
  { kind: "case", id: "lancool-216", name: "Lian Li Lancool 216", formFactors: ["ATX", "mATX", "ITX"], maxGpuMm: 392, maxCoolerMm: 180, fansIncluded: 3, price: 100 },
  { kind: "case", id: "pop-air", name: "Fractal Design Pop Air", formFactors: ["ATX", "mATX", "ITX"], maxGpuMm: 405, fansIncluded: 3, price: 85 },
  { kind: "case", id: "pop-mini-air", name: "Fractal Design Pop Mini Air (micro-ATX)", formFactors: ["mATX", "ITX"], maxGpuMm: 365, maxCoolerMm: 170, fansIncluded: 3, price: 80 },
  { kind: "case", id: "h5-flow", name: "NZXT H5 Flow (2024)", formFactors: ["ATX", "mATX", "ITX"], maxGpuMm: 410, maxCoolerMm: 170, fansIncluded: 2, price: 95 },
  { kind: "case", id: "pure-base-500dx", name: "be quiet! Pure Base 500DX", formFactors: ["ATX", "mATX", "ITX"], maxGpuMm: 369, maxCoolerMm: 190, fansIncluded: 3, price: 110 },
  { kind: "case", id: "fractal-north", name: "Fractal Design North", formFactors: ["ATX", "mATX", "ITX"], maxGpuMm: 355, maxCoolerMm: 170, fansIncluded: 2, price: 140 },
];

/** Longueur max de carte graphique selon la taille de boîtier déclarée (valeurs prudentes). */
export const CASE_GPU_LENGTH: Record<string, number> = {
  small: 280,
  mid: 330,
  full: 380,
};

// ---------------------------------------------------------------------------
// Recherche
// ---------------------------------------------------------------------------

/** Processeur installé : décodé depuis son nom (couvre Intel 4e gén. → Core Ultra et tous les Ryzen). */
export const findCpu = (name?: string): CpuSpec | undefined => cpuFromName(name);
/** Carte graphique installée : table de référence, versions portables et estimation pour les modèles absents. */
export const findGpu = (name?: string): GpuSpec | undefined => findGpuSpec(name);
/** Carte mère installée : base des modèles réels (fiches fabricants), sinon rien (on raisonne alors par chipset). */
export const findBoard = (name?: string) => findKnownBoard(name) ?? (name ? BOARDS.find((b) => b.match?.test(name)) : undefined);

/** Chipset déduit du nom de la carte mère (« MAG B460 TORPEDO » → B460, « H81M-P33 » → H81). */
export function findChipset(boardName?: string): ChipsetSpec | undefined {
  const m = boardName?.toUpperCase().match(/\b([ABHQXZ]\d{2,3})(E)?(?:[MI]|-|\b)/);
  if (!m) return undefined;
  // Variantes « E » (B650E, X670E, X870E) : port graphique en PCIe 5.0 ; sinon, le chipset de base.
  return (m[2] && CHIPSETS.find((c) => c.chipset === m[1] + "E")) || CHIPSETS.find((c) => c.chipset === m[1]);
}

/**
 * Plateformes que PCEvolu ne prend pas en charge (stations de travail, AMD AM3/FM2, Intel avant la 4e génération) :
 * on le dit clairement au lieu de supposer.
 */
const UNSUPPORTED_PLATFORMS: [RegExp, string, string][] = [
  [/\b(X79|X99|X299|C6\d\d|C2\d\d|W680|W790)\b/i, "station de travail Intel (LGA2011 / LGA2066 / Xeon)", "Intel workstation (LGA2011 / LGA2066 / Xeon)"],
  [/\b(X399|TRX40|TRX50|WRX80|WRX90)\b/i, "AMD Threadripper", "AMD Threadripper"],
  [/\b(970|990FX|990X|A88X|A78|A68H|A58)\b/i, "AMD AM3 / FM2 (avant Ryzen)", "AMD AM3 / FM2 (pre-Ryzen)"],
  [/\b(H61|H67|P67|Z68|B75|H77|Z75|Z77|Q77)\b/i, "Intel 2e / 3e génération (LGA1155)", "Intel 2nd / 3rd gen (LGA1155)"],
];

export function unsupportedPlatform(boardName?: string): string | undefined {
  if (!boardName || findChipset(boardName)) return undefined;
  const hit = UNSUPPORTED_PLATFORMS.find(([re]) => re.test(boardName));
  return hit ? tr(hit[1], hit[2]) : undefined;
}

// ---------------------------------------------------------------------------
// Traduction des textes du catalogue (noms génériques, notes)
// ---------------------------------------------------------------------------
// Le catalogue (intégré ou téléchargé) reste en français : on traduit à l'affichage, pour que le
// changement de langue s'applique tout de suite et que le catalogue en ligne reste valable.

/** Notes connues (cartes mères, branchements des cartes graphiques) : texte français → anglais. */
const NOTES_EN: Record<string, string> = {
  "Garde ta RAM DDR4 actuelle.": "Keeps your current DDR4 RAM.",
  "Entrée de gamme : 2 emplacements RAM, à réserver aux processeurs 65 W.": "Entry-level: 2 RAM slots, best kept for 65 W processors.",
  "Choisis un modèle avec bouton de mise à jour du BIOS sans processeur.": "Pick a model with a BIOS update button that works without a processor.",
  "La Founders Edition utilise un connecteur 16 broches (adaptateur fourni) ; la plupart des modèles partenaires, un câble 8 broches.":
    "The Founders Edition uses a 16-pin connector (adapter included); most partner models use one 8-pin cable.",
  "Beaucoup de modèles partenaires utilisent simplement un câble PCIe 8 broches au lieu du connecteur 16 broches.":
    "Many partner models simply use one 8-pin PCIe cable instead of the 16-pin connector.",
  "Selon le modèle : 1 ou 2 câbles PCIe 8 broches (parfois 8 + 6 broches).": "Depending on the model: 1 or 2 8-pin PCIe cables (sometimes 8 + 6 pins).",
  "Quelques modèles (ASUS TUF) utilisent un connecteur 16 broches au lieu du câble 8 broches.": "A few models (ASUS TUF) use a 16-pin connector instead of the 8-pin cable.",
  "Selon le modèle : 2 câbles 8 broches (Sapphire Pulse, PowerColor Reaper), 3 câbles 8 broches (Gigabyte Gaming OC, PowerColor Red Devil) ou un connecteur 12V-2x6 (Sapphire NITRO+). Les modèles overclockés conseillent 850 à 900 W.":
    "Depending on the model: 2 8-pin cables (Sapphire Pulse, PowerColor Reaper), 3 8-pin cables (Gigabyte Gaming OC, PowerColor Red Devil) or a 12V-2x6 connector (Sapphire NITRO+). Overclocked models recommend 850 to 900 W.",
  "Certains modèles haut de gamme (Sapphire NITRO+) demandent 3 câbles 8 broches.": "Some high-end models (Sapphire NITRO+) need 3 8-pin cables.",
  "Graphiques intégrés Intel": "Intel integrated graphics",
  "Graphiques intégrés AMD (Radeon / Vega)": "AMD integrated graphics (Radeon / Vega)",
};

/** Noms génériques (« Carte mère B650 ATX », « Kit 2 × 16 Go… », « Alimentation 750 W… ») : règles de traduction. */
const NAME_RULES: [RegExp, string][] = [
  [/^Carte mère (\S+(?: DDR[45])?(?: ATX)?)/, "$1 motherboard"],
  [/\(micro-ATX, entrée de gamme\)/, "(micro-ATX, entry-level)"],
  [/\(Intel, profil XMP\)/, "(Intel, XMP profile)"],
  [/^Alimentation (\d+ W(?: 80\+ \w+)?)/, "$1 power supply"],
  [/\(sans câble 12V-2x6\)/, "(no 12V-2x6 cable)"],
  [/avec câble 12V-2x6/, "with 12V-2x6 cable"],
  [/modèle (\d{4})/, "$1 model"],
  [/^Barrette (\d+) Go (\S+)/, "$1 GB $2 stick"],
  [/^Disque dur 3,5" /, '3.5" hard drive, '],
  [/ 2,5" /, ' 2.5" '],
  [/\(lot de (\d+)\)/, "($1-pack)"],
  [/\(lot de (\d+), /, "($1-pack, "],
  [/\(bas profil\)/, "(low profile)"],
  [/\(intégrée\)/, "(integrated)"],
  [/ \(portable\)$/, " (laptop)"],
  [/\(ex\. /, "(e.g. "],
  [/(\d) Go\b/g, "$1 GB"],
  [/(\d) To\b/g, "$1 TB"],
];

/** Texte venant du catalogue (nom générique ou note), dans la langue choisie. */
export function catalogText(fr: string): string;
export function catalogText(fr: string | undefined): string | undefined;
export function catalogText(fr: string | undefined): string | undefined {
  if (fr == null) return fr;
  const known = NOTES_EN[fr];
  if (known) return tr(fr, known);
  let en = fr;
  for (const [re, to] of NAME_RULES) en = en.replace(re, to);
  return tr(fr, en);
}

/** Nom d'une pièce à afficher (les noms de modèles restent tels quels, les noms génériques sont traduits). */
export const partName = (p: { name: string }) => catalogText(p.name);

/** PC de marque (Dell, HP, Lenovo…) : alimentation et carte mère souvent propriétaires. */
export const OEM_BRANDS = /\b(dell|hewlett|hp\b|lenovo|acer|asus(?!tek computer inc\.?$)|medion|fujitsu|packard bell|apple|microsoft)/i;
