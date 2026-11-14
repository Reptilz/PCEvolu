// Catalogue de composants.
//
// - Processeurs : décodés depuis leur nom (cpudb.ts), seuls ceux proposés à l'achat sont listés ici.
// - Cartes graphiques : table de référence 2016 → 2026 (gpudb.ts).
// - Les indices de performance sont des ordres de grandeur, pas des benchmarks précis.
// - Les prix sont indicatifs : ils sont remplacés chaque semaine par le relevé du marché (data/prices.json).

import type {
  BoardSpec, CaseSpec, ChipsetSpec, CoolerSpec, CpuGen, CpuSpec, FanKit, GpuSpec,
  PsuSpec, RamKit, Socket, SsdSpec, Availability,
} from "./types";
import { cpuFromName, purchasable } from "./cpudb";
import { GPU_TABLE, findGpuSpec } from "./gpudb";
import { findKnownBoard } from "./boards";

export const CATALOG_DATE = "novembre 2026";
/** Incrémenté à chaque mise à jour du catalogue (le catalogue téléchargé n'est pris que s'il est plus récent). */
export const CATALOG_VERSION = 6;

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
  board("mb-b850-atx", "Carte mère B850 ATX", "AM5", "B850", "ATX", "DDR5", { maxGb: 256, m2: 3, pcie: 5, avail: "new", price: 200 }),
];


// ---------------------------------------------------------------------------
// RAM, stockage, alimentations, refroidissement, boîtiers
// ---------------------------------------------------------------------------

const ram = (id: string, name: string, type: RamKit["type"], sticks: number, gbPerStick: number, mts: number, price: number): RamKit =>
  ({ kind: "ram", id, name, type, sticks, gbPerStick, mts, price });

export const RAM_KITS: RamKit[] = [
  ram("d4-1x8-3200", "Crucial 8 Go DDR4-3200", "DDR4", 1, 8, 3200, 25),
  ram("d4-1x16-3200", "Crucial 16 Go DDR4-3200", "DDR4", 1, 16, 3200, 45),
  ram("d4-2x8-3200", "Kit 2 × 8 Go DDR4-3200 CL16", "DDR4", 2, 8, 3200, 50),
  ram("d4-2x16-3200", "Kit 2 × 16 Go DDR4-3200 CL16", "DDR4", 2, 16, 3200, 85),
  ram("d4-2x32-3200", "Kit 2 × 32 Go DDR4-3200 CL16", "DDR4", 2, 32, 3200, 165),
  ram("d5-2x16-6000", "Kit 2 × 16 Go DDR5-6000 CL30", "DDR5", 2, 16, 6000, 140),
  ram("d5-2x32-6000", "Kit 2 × 32 Go DDR5-6000 CL30", "DDR5", 2, 32, 6000, 260),
];

const ssd = (id: string, name: string, iface: SsdSpec["iface"], tb: number, price: number): SsdSpec => ({ kind: "ssd", id, name, iface, tb, price });

// Les SSD sont interchangeables : on raisonne par type et capacité (prix = médiane du marché),
// avec des exemples de modèles. Les SSD PCIe 3.0 ont quasiment disparu du neuf : le NVMe courant est en PCIe 4.0.
export const SSDS: SsdSpec[] = [
  ssd("nvme-500gb", "SSD NVMe M.2 500 Go (ex. Kingston NV3, Crucial P3 Plus)", "NVMe4", 0.5, 90),
  ssd("nvme-1tb", "SSD NVMe M.2 1 To (ex. Kingston NV3, WD SN7100)", "NVMe4", 1, 170),
  ssd("nvme-2tb", "SSD NVMe M.2 2 To (ex. Kingston NV3, WD SN7100)", "NVMe4", 2, 300),
  ssd("nvme-4tb", "SSD NVMe M.2 4 To (ex. WD SN7100, Lexar NM790)", "NVMe4", 4, 600),
  // PCIe 5.0 : ≈ 12 000 Mo/s, mais seulement sur un emplacement M.2 PCIe 5.0 (cartes AM5 / LGA1851 récentes). Gain peu visible en jeu.
  ssd("nvme5-2tb", "SSD NVMe PCIe 5.0 2 To (ex. Samsung 9100 Pro, Crucial T705)", "NVMe5", 2, 300),
  ssd("sata-500gb", "SSD SATA 2,5\" 500 Go (ex. Crucial MX500, Samsung 870 EVO)", "SATA", 0.5, 80),
  ssd("sata-1tb", "SSD SATA 2,5\" 1 To (ex. Crucial MX500)", "SATA", 1, 150),
  ssd("sata-2tb", "SSD SATA 2,5\" 2 To (ex. Crucial MX500)", "SATA", 2, 280),
  // Disques durs : beaucoup de place pour pas cher, pour stocker (photos, vidéos, sauvegardes), pas pour Windows ni les jeux.
  ssd("hdd-2tb", "Disque dur 3,5\" 2 To (ex. Seagate BarraCuda, WD Blue)", "HDD", 2, 200),
  ssd("hdd-4tb", "Disque dur 3,5\" 4 To (ex. Seagate BarraCuda, WD Blue)", "HDD", 4, 250),
];

const psu = (id: string, name: string, watts: number, atx3: boolean, native12v2x6: boolean, pcie8pin: number, price: number): PsuSpec =>
  ({ kind: "psu", id, name, watts, atx3, native12v2x6, pcie8pin, price });

// Génériques par puissance (prix = médiane du marché). À partir de 650 W : 80+ Gold, ATX 3.x,
// câble 12V-2x6 natif pour les cartes graphiques récentes.
export const PSUS: PsuSpec[] = [
  psu("psu-550", "Alimentation 550 W 80+ Bronze (ex. be quiet! System Power, Corsair CX)", 550, false, false, 2, 60),
  psu("psu-650-bronze", "Alimentation 650 W 80+ Bronze (sans câble 12V-2x6)", 650, false, false, 2, 65),
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
const UNSUPPORTED_PLATFORMS: [RegExp, string][] = [
  [/\b(X79|X99|X299|C6\d\d|C2\d\d|W680|W790)\b/i, "station de travail Intel (LGA2011 / LGA2066 / Xeon)"],
  [/\b(X399|TRX40|TRX50|WRX80|WRX90)\b/i, "AMD Threadripper"],
  [/\b(970|990FX|990X|A88X|A78|A68H|A58)\b/i, "AMD AM3 / FM2 (avant Ryzen)"],
  [/\b(H61|H67|P67|Z68|B75|H77|Z75|Z77|Q77)\b/i, "Intel 2e / 3e génération (LGA1155)"],
];

export function unsupportedPlatform(boardName?: string): string | undefined {
  if (!boardName || findChipset(boardName)) return undefined;
  return UNSUPPORTED_PLATFORMS.find(([re]) => re.test(boardName))?.[1];
}

/** PC de marque (Dell, HP, Lenovo…) : alimentation et carte mère souvent propriétaires. */
export const OEM_BRANDS = /\b(dell|hewlett|hp\b|lenovo|acer|asus(?!tek computer inc\.?$)|medion|fujitsu|packard bell|apple|microsoft)/i;
