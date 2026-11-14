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

export const CATALOG_DATE = "novembre 2026";
/** Incrémenté à chaque mise à jour du catalogue (le catalogue téléchargé n'est pris que s'il est plus récent). */
export const CATALOG_VERSION = 2;

// ---------------------------------------------------------------------------
// Chipsets : ce qui définit la compatibilité CPU / RAM / PCIe d'une carte mère
// ---------------------------------------------------------------------------

const I6_7: CpuGen[] = ["intel-6", "intel-7"];
const I8_9: CpuGen[] = ["intel-8", "intel-9"];
const I10: CpuGen[] = ["intel-10"];
const I10_11: CpuGen[] = ["intel-10", "intel-11"];
const I12_14: CpuGen[] = ["intel-12", "intel-13", "intel-14"];
const AM4_ALL: CpuGen[] = ["amd-zen1", "amd-zen2", "amd-zen3"];
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
  chip("A320", "AM4", ["DDR4"], 3, AM4_ALL, false, ["amd-zen3"]),
  chip("B350", "AM4", ["DDR4"], 3, AM4_ALL, true, ["amd-zen3"]),
  chip("X370", "AM4", ["DDR4"], 3, AM4_ALL, true, ["amd-zen3"]),
  chip("B450", "AM4", ["DDR4"], 3, AM4_ALL, true, ["amd-zen3"]),
  chip("X470", "AM4", ["DDR4"], 3, AM4_ALL, true, ["amd-zen3"]),
  chip("A520", "AM4", ["DDR4"], 3, ["amd-zen2", "amd-zen3"], false),
  chip("B550", "AM4", ["DDR4"], 4, ["amd-zen2", "amd-zen3"], true),
  chip("X570", "AM4", ["DDR4"], 4, AM4_ALL, true),
  // AM5
  chip("A620", "AM5", ["DDR5"], 4, AM5_ALL, true, ["amd-zen5"]),
  chip("B650", "AM5", ["DDR5"], 4, AM5_ALL, true, ["amd-zen5"]),
  chip("X670", "AM5", ["DDR5"], 5, AM5_ALL, true, ["amd-zen5"]),
  chip("B840", "AM5", ["DDR5"], 3, AM5_ALL, false),
  chip("B850", "AM5", ["DDR5"], 5, AM5_ALL, true),
  chip("X870", "AM5", ["DDR5"], 5, AM5_ALL, true),
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
  // Cartes déjà installées chez les utilisateurs (pour connaître leurs slots exacts)
  board("msi-b460-torpedo", "MSI MAG B460 TORPEDO", "LGA1200", "B460", "ATX", "DDR4", { maxGb: 128, m2: 2, pcie: 3, match: /B460 TORPEDO/i }),
  board("msi-b460m-pro", "MSI B460M PRO", "LGA1200", "B460", "mATX", "DDR4", { slots: 2, maxGb: 64, m2: 1, pcie: 3, match: /B460M[- ]PRO/i }),
  board("msi-b450-tomahawk", "MSI B450 TOMAHAWK", "AM4", "B450", "ATX", "DDR4", { maxGb: 64, m2: 1, pcie: 3, match: /B450 TOMAHAWK/i }),
  board("msi-b550-a-pro", "MSI B550-A PRO", "AM4", "B550", "ATX", "DDR4", { maxGb: 128, m2: 2, pcie: 4, avail: "new", price: 115, match: /B550-A PRO/i }),
  // Proposées pour un changement de plateforme
  board("msi-b760-p-ddr4", "MSI PRO B760-P DDR4 II", "LGA1700", "B760", "ATX", "DDR4", { maxGb: 128, m2: 2, pcie: 4, avail: "new", price: 125, note: "Garde ta RAM DDR4 actuelle." }),
  board("asus-b760m-a-d4", "ASUS PRIME B760M-A D4", "LGA1700", "B760", "mATX", "DDR4", { maxGb: 128, m2: 2, pcie: 4, avail: "new", price: 115, note: "Garde ta RAM DDR4 actuelle." }),
  board("msi-b760-p-ddr5", "MSI PRO B760-P II (DDR5)", "LGA1700", "B760", "ATX", "DDR5", { maxGb: 192, m2: 2, pcie: 4, avail: "new", price: 145 }),
  board("msi-b860-p", "MSI PRO B860-P", "LGA1851", "B860", "ATX", "DDR5", { maxGb: 256, m2: 3, pcie: 5, avail: "new", price: 165 }),
  board("asus-b860m-a", "ASUS PRIME B860M-A", "LGA1851", "B860", "mATX", "DDR5", { maxGb: 256, m2: 2, pcie: 5, avail: "new", price: 150 }),
  board("msi-b650-p", "MSI PRO B650-P WIFI", "AM5", "B650", "ATX", "DDR5", { maxGb: 192, m2: 2, pcie: 4, avail: "new", price: 150, note: "Bouton Flash BIOS : mise à jour possible sans processeur." }),
  board("gb-b650m-ds3h", "Gigabyte B650M DS3H", "AM5", "B650", "mATX", "DDR5", { maxGb: 192, m2: 2, pcie: 4, avail: "new", price: 125, note: "Q-Flash Plus : mise à jour du BIOS possible sans processeur." }),
  board("gb-b850-eagle", "Gigabyte B850 EAGLE WIFI6E", "AM5", "B850", "ATX", "DDR5", { maxGb: 256, m2: 3, pcie: 5, avail: "new", price: 180 }),
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
  ssd("nvme-1tb", "SSD NVMe M.2 1 To (ex. Kingston NV3, WD SN7100)", "NVMe4", 1, 170),
  ssd("nvme-2tb", "SSD NVMe M.2 2 To (ex. Kingston NV3, WD SN7100)", "NVMe4", 2, 300),
  ssd("sata-1tb", "SSD SATA 2,5\" 1 To (ex. Crucial MX500)", "SATA", 1, 150),
  ssd("sata-2tb", "SSD SATA 2,5\" 2 To (ex. Crucial MX500)", "SATA", 2, 280),
];

const psu = (id: string, name: string, watts: number, atx3: boolean, native12v2x6: boolean, pcie8pin: number, price: number): PsuSpec =>
  ({ kind: "psu", id, name, watts, atx3, native12v2x6, pcie8pin, price });

export const PSUS: PsuSpec[] = [
  psu("rm650e", "Corsair RM650e (ATX 3.1, 80+ Gold)", 650, true, true, 2, 90),
  psu("rm750e", "Corsair RM750e (ATX 3.1, 80+ Gold)", 750, true, true, 3, 105),
  psu("rm850e", "Corsair RM850e (ATX 3.1, 80+ Gold)", 850, true, true, 3, 125),
  psu("rm1000e", "Corsair RM1000e (ATX 3.1, 80+ Gold)", 1000, true, true, 4, 165),
];

const cooler = (id: string, name: string, type: CoolerSpec["type"], sockets: Socket[], capacityW: number, price: number): CoolerSpec =>
  ({ kind: "cooler", id, name, type, sockets, capacityW, price });

export const COOLERS: CoolerSpec[] = [
  cooler("arctic-f36", "Arctic Freezer 36", "air", ["LGA1700", "LGA1851", "AM4", "AM5"], 180, 32),
  cooler("pa120se", "Thermalright Peerless Assassin 120 SE", "air", ["LGA1151", "LGA1200", "LGA1700", "LGA1851", "AM4", "AM5"], 240, 40),
  cooler("lf3-360", "Arctic Liquid Freezer III 360", "aio", ["LGA1700", "LGA1851", "AM4", "AM5"], 300, 100),
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

export const CASES: CaseSpec[] = [
  { kind: "case", id: "lancool-216", name: "Lian Li Lancool 216", formFactors: ["ATX", "mATX", "ITX"], maxGpuMm: 392, fansIncluded: 3, price: 100 },
  { kind: "case", id: "pop-air", name: "Fractal Design Pop Air", formFactors: ["ATX", "mATX", "ITX"], maxGpuMm: 405, fansIncluded: 3, price: 85 },
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
export const findBoard = (name?: string) => (name ? BOARDS.find((b) => b.match?.test(name)) : undefined);

/** Chipset déduit du nom de la carte mère (« MAG B460 TORPEDO » → B460, « H81M-P33 » → H81). */
export function findChipset(boardName?: string): ChipsetSpec | undefined {
  const m = boardName?.toUpperCase().match(/\b([ABHQXZ]\d{2,3})(?:[EMI]|-|\b)/);
  return m ? CHIPSETS.find((c) => c.chipset === m[1]) : undefined;
}

/** PC de marque (Dell, HP, Lenovo…) : alimentation et carte mère souvent propriétaires. */
export const OEM_BRANDS = /\b(dell|hewlett|hp\b|lenovo|acer|asus(?!tek computer inc\.?$)|medion|fujitsu|packard bell|apple|microsoft)/i;
