// Catalogue de composants (V1, maintenu à la main).
//
// - Les indices de performance sont des ordres de grandeur, pas des benchmarks précis.
// - Les prix sont indicatifs (neuf, France/Benelux) et devront venir d'un flux de prix en V2.
// - Les longueurs de cartes graphiques sont des longueurs typiques des modèles partenaires.

import type {
  BoardSpec, CaseSpec, ChipsetSpec, CoolerSpec, CpuGen, CpuSpec, FanKit, GpuPower, GpuSpec,
  PsuSpec, RamKit, Socket, SsdSpec, Availability,
} from "./types";

export const CATALOG_DATE = "novembre 2026";

// ---------------------------------------------------------------------------
// Chipsets : ce qui définit la compatibilité CPU / RAM / PCIe d'une carte mère
// ---------------------------------------------------------------------------

const I10: CpuGen[] = ["intel-10"];
const I10_11: CpuGen[] = ["intel-10", "intel-11"];
const I12_14: CpuGen[] = ["intel-12", "intel-13", "intel-14"];
const AM4_ALL: CpuGen[] = ["amd-zen1", "amd-zen2", "amd-zen3"];
const AM5_ALL: CpuGen[] = ["amd-zen4", "amd-zen5"];

export const CHIPSETS: ChipsetSpec[] = [
  { chipset: "B360", socket: "LGA1151", ramTypes: ["DDR4"], pcieGpu: 3, cpuGens: ["intel-8", "intel-9"], ramOc: false },
  { chipset: "Z390", socket: "LGA1151", ramTypes: ["DDR4"], pcieGpu: 3, cpuGens: ["intel-8", "intel-9"], ramOc: true },
  { chipset: "H410", socket: "LGA1200", ramTypes: ["DDR4"], pcieGpu: 3, cpuGens: I10, ramOc: false },
  { chipset: "B460", socket: "LGA1200", ramTypes: ["DDR4"], pcieGpu: 3, cpuGens: I10, ramOc: false },
  { chipset: "H470", socket: "LGA1200", ramTypes: ["DDR4"], pcieGpu: 3, cpuGens: I10_11, ramOc: false },
  { chipset: "Z490", socket: "LGA1200", ramTypes: ["DDR4"], pcieGpu: 4, cpuGens: I10_11, ramOc: true },
  { chipset: "H510", socket: "LGA1200", ramTypes: ["DDR4"], pcieGpu: 3, cpuGens: I10_11, ramOc: false },
  { chipset: "B560", socket: "LGA1200", ramTypes: ["DDR4"], pcieGpu: 4, cpuGens: I10_11, ramOc: true },
  { chipset: "Z590", socket: "LGA1200", ramTypes: ["DDR4"], pcieGpu: 4, cpuGens: I10_11, ramOc: true },
  { chipset: "H610", socket: "LGA1700", ramTypes: ["DDR4", "DDR5"], pcieGpu: 4, cpuGens: I12_14, biosUpdateFor: ["intel-13", "intel-14"], ramOc: false },
  { chipset: "B660", socket: "LGA1700", ramTypes: ["DDR4", "DDR5"], pcieGpu: 4, cpuGens: I12_14, biosUpdateFor: ["intel-13", "intel-14"], ramOc: true },
  { chipset: "Z690", socket: "LGA1700", ramTypes: ["DDR4", "DDR5"], pcieGpu: 5, cpuGens: I12_14, biosUpdateFor: ["intel-13", "intel-14"], ramOc: true },
  { chipset: "B760", socket: "LGA1700", ramTypes: ["DDR4", "DDR5"], pcieGpu: 4, cpuGens: I12_14, ramOc: true },
  { chipset: "Z790", socket: "LGA1700", ramTypes: ["DDR4", "DDR5"], pcieGpu: 5, cpuGens: I12_14, ramOc: true },
  { chipset: "B860", socket: "LGA1851", ramTypes: ["DDR5"], pcieGpu: 5, cpuGens: ["intel-ultra2"], ramOc: true },
  { chipset: "Z890", socket: "LGA1851", ramTypes: ["DDR5"], pcieGpu: 5, cpuGens: ["intel-ultra2"], ramOc: true },
  { chipset: "A320", socket: "AM4", ramTypes: ["DDR4"], pcieGpu: 3, cpuGens: AM4_ALL, biosUpdateFor: ["amd-zen3"], ramOc: false },
  { chipset: "B350", socket: "AM4", ramTypes: ["DDR4"], pcieGpu: 3, cpuGens: AM4_ALL, biosUpdateFor: ["amd-zen3"], ramOc: true },
  { chipset: "B450", socket: "AM4", ramTypes: ["DDR4"], pcieGpu: 3, cpuGens: AM4_ALL, biosUpdateFor: ["amd-zen3"], ramOc: true },
  { chipset: "X470", socket: "AM4", ramTypes: ["DDR4"], pcieGpu: 3, cpuGens: AM4_ALL, biosUpdateFor: ["amd-zen3"], ramOc: true },
  { chipset: "A520", socket: "AM4", ramTypes: ["DDR4"], pcieGpu: 3, cpuGens: ["amd-zen2", "amd-zen3"], ramOc: false },
  { chipset: "B550", socket: "AM4", ramTypes: ["DDR4"], pcieGpu: 4, cpuGens: ["amd-zen2", "amd-zen3"], ramOc: true },
  { chipset: "X570", socket: "AM4", ramTypes: ["DDR4"], pcieGpu: 4, cpuGens: AM4_ALL, ramOc: true },
  { chipset: "A620", socket: "AM5", ramTypes: ["DDR5"], pcieGpu: 4, cpuGens: AM5_ALL, biosUpdateFor: ["amd-zen5"], ramOc: true },
  { chipset: "B650", socket: "AM5", ramTypes: ["DDR5"], pcieGpu: 4, cpuGens: AM5_ALL, biosUpdateFor: ["amd-zen5"], ramOc: true },
  { chipset: "X670", socket: "AM5", ramTypes: ["DDR5"], pcieGpu: 5, cpuGens: AM5_ALL, biosUpdateFor: ["amd-zen5"], ramOc: true },
  { chipset: "B850", socket: "AM5", ramTypes: ["DDR5"], pcieGpu: 5, cpuGens: AM5_ALL, ramOc: true },
  { chipset: "X870", socket: "AM5", ramTypes: ["DDR5"], pcieGpu: 5, cpuGens: AM5_ALL, ramOc: true },
];

// ---------------------------------------------------------------------------
// Processeurs
// ---------------------------------------------------------------------------

function cpu(
  id: string, name: string, socket: Socket, gen: CpuGen, cores: number, threads: number,
  powerW: number, gaming: number, gpuCeiling: number,
  o: { igpu?: boolean; box?: boolean; avail?: Availability; price?: number; ram: Partial<Record<"DDR4" | "DDR5", number>>; match: RegExp },
): CpuSpec {
  return {
    kind: "cpu", id, name, brand: socket.startsWith("AM") ? "AMD" : "Intel", socket, gen, cores, threads, powerW,
    gaming, gpuCeiling, ramMaxMts: o.ram, igpu: o.igpu ?? true, boxCooler: o.box ?? false,
    availability: o.avail ?? null, price: o.price, match: o.match,
  };
}

const D4_2666 = { DDR4: 2666 };
const D4_2933 = { DDR4: 2933 };
const D4_3200 = { DDR4: 3200 };
const D45 = (d5: number) => ({ DDR4: 3200, DDR5: d5 });

export const CPUS: CpuSpec[] = [
  // Intel 10e génération (LGA1200)
  cpu("i3-10100", "Intel Core i3-10100", "LGA1200", "intel-10", 4, 8, 90, 78, 110, { box: true, ram: D4_2666, match: /i3-10100/ }),
  cpu("i5-10400", "Intel Core i5-10400", "LGA1200", "intel-10", 6, 12, 134, 92, 140, { box: true, ram: D4_2666, match: /i5-10400/ }),
  cpu("i5-10600k", "Intel Core i5-10600K", "LGA1200", "intel-10", 6, 12, 182, 100, 155, { ram: D4_2666, match: /i5-10600/ }),
  cpu("i7-10700f", "Intel Core i7-10700F", "LGA1200", "intel-10", 8, 16, 224, 106, 165, { igpu: false, box: true, avail: "used", price: 140, ram: D4_2933, match: /i7-10700(?!K)/ }),
  cpu("i7-10700k", "Intel Core i7-10700K", "LGA1200", "intel-10", 8, 16, 229, 110, 170, { avail: "used", price: 160, ram: D4_2933, match: /i7-10700K/ }),
  cpu("i9-10900f", "Intel Core i9-10900F", "LGA1200", "intel-10", 10, 20, 224, 110, 170, { igpu: false, box: true, avail: "used", price: 190, ram: D4_2933, match: /i9-10900(?!K)/ }),
  cpu("i9-10900k", "Intel Core i9-10900K", "LGA1200", "intel-10", 10, 20, 250, 114, 175, { avail: "used", price: 220, ram: D4_2933, match: /i9-10900K|i9-10850K/ }),
  // Intel 11e génération (LGA1200, non supportée par H410/B460)
  cpu("i5-11400", "Intel Core i5-11400", "LGA1200", "intel-11", 6, 12, 154, 104, 160, { box: true, avail: "used", price: 100, ram: D4_3200, match: /i5-11400/ }),
  cpu("i7-11700k", "Intel Core i7-11700K", "LGA1200", "intel-11", 8, 16, 251, 114, 175, { avail: "used", price: 170, ram: D4_3200, match: /i7-11700/ }),
  // Intel 12e à 14e génération (LGA1700)
  cpu("i5-12400f", "Intel Core i5-12400F", "LGA1700", "intel-12", 6, 12, 117, 124, 190, { igpu: false, box: true, avail: "new", price: 110, ram: D45(4800), match: /i5-12400/ }),
  cpu("i5-13400f", "Intel Core i5-13400F", "LGA1700", "intel-13", 10, 16, 148, 130, 195, { igpu: false, box: true, ram: D45(4800), match: /i5-13400/ }),
  cpu("i5-13600k", "Intel Core i5-13600K", "LGA1700", "intel-13", 14, 20, 181, 150, 230, { ram: D45(5600), match: /i5-13600/ }),
  cpu("i5-14400f", "Intel Core i5-14400F", "LGA1700", "intel-14", 10, 16, 148, 134, 200, { igpu: false, box: true, avail: "new", price: 130, ram: D45(4800), match: /i5-14400/ }),
  cpu("i5-14600kf", "Intel Core i5-14600KF", "LGA1700", "intel-14", 14, 20, 181, 155, 240, { igpu: false, avail: "new", price: 190, ram: D45(5600), match: /i5-14600/ }),
  cpu("i7-14700kf", "Intel Core i7-14700KF", "LGA1700", "intel-14", 20, 28, 253, 168, 265, { igpu: false, avail: "new", price: 320, ram: D45(5600), match: /i7-14700/ }),
  cpu("i7-12700k", "Intel Core i7-12700K", "LGA1700", "intel-12", 12, 20, 190, 140, 215, { ram: D45(4800), match: /i7-12700/ }),
  cpu("i7-13700k", "Intel Core i7-13700K", "LGA1700", "intel-13", 16, 24, 253, 162, 255, { ram: D45(5600), match: /i7-13700/ }),
  cpu("i9-14900k", "Intel Core i9-14900K", "LGA1700", "intel-14", 24, 32, 253, 172, 275, { ram: D45(5600), match: /i9-1[34]900/ }),
  // Intel Core Ultra 200S (LGA1851, DDR5 uniquement)
  cpu("u5-245kf", "Intel Core Ultra 5 245KF", "LGA1851", "intel-ultra2", 14, 14, 159, 145, 225, { igpu: false, avail: "new", price: 230, ram: { DDR5: 6400 }, match: /Ultra 5 245/ }),
  cpu("u7-265kf", "Intel Core Ultra 7 265KF", "LGA1851", "intel-ultra2", 20, 20, 250, 158, 250, { igpu: false, avail: "new", price: 290, ram: { DDR5: 6400 }, match: /Ultra 7 265/ }),
  // AMD AM4 (DDR4)
  cpu("r5-3600", "AMD Ryzen 5 3600", "AM4", "amd-zen2", 6, 12, 88, 88, 130, { igpu: false, box: true, ram: D4_3200, match: /Ryzen 5 3600/ }),
  cpu("r5-5600", "AMD Ryzen 5 5600", "AM4", "amd-zen3", 6, 12, 88, 108, 165, { igpu: false, box: true, avail: "new", price: 95, ram: D4_3200, match: /Ryzen 5 5600(?!G)/ }),
  cpu("r7-5700x3d", "AMD Ryzen 7 5700X3D", "AM4", "amd-zen3", 8, 16, 105, 138, 210, { igpu: false, avail: "new", price: 200, ram: D4_3200, match: /Ryzen 7 5700X3D/ }),
  cpu("r7-5800x3d", "AMD Ryzen 7 5800X3D", "AM4", "amd-zen3", 8, 16, 142, 145, 220, { igpu: false, ram: D4_3200, match: /Ryzen 7 5800X3D/ }),
  cpu("r7-5700x", "AMD Ryzen 7 5700X", "AM4", "amd-zen3", 8, 16, 88, 112, 170, { igpu: false, ram: D4_3200, match: /Ryzen 7 5700X(?!3D)|Ryzen 7 5800X(?!3D)/ }),
  // AMD AM5 (DDR5 uniquement)
  cpu("r5-7600", "AMD Ryzen 5 7600", "AM5", "amd-zen4", 6, 12, 88, 148, 230, { box: true, avail: "new", price: 175, ram: { DDR5: 5200 }, match: /Ryzen 5 7600/ }),
  cpu("r5-9600x", "AMD Ryzen 5 9600X", "AM5", "amd-zen5", 6, 12, 88, 158, 245, { avail: "new", price: 210, ram: { DDR5: 5600 }, match: /Ryzen 5 9600/ }),
  cpu("r7-7800x3d", "AMD Ryzen 7 7800X3D", "AM5", "amd-zen4", 8, 16, 162, 185, 300, { avail: "new", price: 360, ram: { DDR5: 5200 }, match: /Ryzen 7 7800X3D/ }),
  cpu("r7-9800x3d", "AMD Ryzen 7 9800X3D", "AM5", "amd-zen5", 8, 16, 162, 210, 330, { avail: "new", price: 470, ram: { DDR5: 5600 }, match: /Ryzen 7 9800X3D/ }),
];

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
  board("msi-b760-p-ddr5", "MSI PRO B760-P WIFI DDR5", "LGA1700", "B760", "ATX", "DDR5", { maxGb: 192, m2: 2, pcie: 4, avail: "new", price: 145 }),
  board("msi-b860-p", "MSI PRO B860-P", "LGA1851", "B860", "ATX", "DDR5", { maxGb: 256, m2: 3, pcie: 5, avail: "new", price: 165 }),
  board("asus-b860m-a", "ASUS PRIME B860M-A", "LGA1851", "B860", "mATX", "DDR5", { maxGb: 256, m2: 2, pcie: 5, avail: "new", price: 150 }),
  board("msi-b650-p", "MSI PRO B650-P WIFI", "AM5", "B650", "ATX", "DDR5", { maxGb: 192, m2: 2, pcie: 4, avail: "new", price: 150, note: "Bouton Flash BIOS : mise à jour possible sans processeur." }),
  board("gb-b650m-ds3h", "Gigabyte B650M DS3H", "AM5", "B650", "mATX", "DDR5", { maxGb: 192, m2: 2, pcie: 4, avail: "new", price: 125, note: "Q-Flash Plus : mise à jour du BIOS possible sans processeur." }),
  board("gb-b850-eagle", "Gigabyte B850 EAGLE WIFI6E", "AM5", "B850", "ATX", "DDR5", { maxGb: 256, m2: 3, pcie: 5, avail: "new", price: 180 }),
];

// ---------------------------------------------------------------------------
// Cartes graphiques
// ---------------------------------------------------------------------------

function gpu(
  id: string, name: string, vramGb: number, tbp: number, psuRec: number, power: GpuPower, lengthMm: number,
  pcieLanes: 8 | 16, perf: number, match: RegExp, o: { avail?: Availability; price?: number } = {},
): GpuSpec {
  const brand = /Radeon|RX /.test(name) ? "AMD" : /Arc/.test(name) ? "Intel" : "NVIDIA";
  return { kind: "gpu", id, name, brand, vramGb, tbp, psuRec, power, lengthMm, pcieLanes, perf, availability: o.avail ?? null, price: o.price, match };
}

export const GPUS: GpuSpec[] = [
  // Anciennes générations (pour reconnaître la carte actuelle)
  gpu("gtx-1060", "GeForce GTX 1060", 6, 120, 400, "1x8", 230, 16, 45, /GTX 1060/),
  gpu("gtx-1070", "GeForce GTX 1070", 8, 150, 500, "1x8", 260, 16, 58, /GTX 1070/),
  gpu("gtx-1080", "GeForce GTX 1080", 8, 180, 500, "1x8", 270, 16, 68, /GTX 1080(?! Ti)/),
  gpu("gtx-1660", "GeForce GTX 1660 (Super/Ti)", 6, 125, 450, "1x8", 230, 16, 52, /GTX 1660/),
  gpu("rtx-2060", "GeForce RTX 2060", 6, 160, 500, "1x8", 240, 16, 66, /RTX 2060/),
  gpu("rtx-2070", "GeForce RTX 2070 (Super)", 8, 215, 550, "2x8", 270, 16, 82, /RTX 2070/),
  gpu("rtx-3050", "GeForce RTX 3050", 8, 130, 550, "1x8", 230, 8, 55, /RTX 3050/),
  gpu("rtx-3060", "GeForce RTX 3060", 12, 170, 550, "1x8", 240, 16, 78, /RTX 3060(?! Ti)/),
  gpu("rtx-3060ti", "GeForce RTX 3060 Ti", 8, 200, 600, "1x8", 250, 16, 100, /RTX 3060 Ti/),
  gpu("rtx-3070", "GeForce RTX 3070", 8, 220, 650, "2x8", 270, 16, 112, /RTX 3070(?! Ti)/),
  gpu("rtx-3080", "GeForce RTX 3080", 10, 320, 750, "2x8", 300, 16, 150, /RTX 3080/),
  gpu("rtx-4060", "GeForce RTX 4060", 8, 115, 550, "1x8", 230, 8, 95, /RTX 4060(?! Ti)/),
  gpu("rtx-4060ti", "GeForce RTX 4060 Ti", 8, 160, 550, "1x8", 250, 8, 108, /RTX 4060 Ti/),
  gpu("rtx-4070", "GeForce RTX 4070 (Super)", 12, 220, 650, "12V-2x6", 270, 16, 155, /RTX 4070(?! Ti)/),
  gpu("rtx-4070ti", "GeForce RTX 4070 Ti", 12, 285, 700, "12V-2x6", 300, 16, 185, /RTX 4070 Ti/),
  gpu("rtx-4080", "GeForce RTX 4080", 16, 320, 750, "12V-2x6", 330, 16, 235, /RTX 4080/),
  gpu("rx-580", "Radeon RX 580", 8, 185, 500, "1x8", 240, 16, 45, /RX 5[78]0(?!0)/),
  gpu("rx-5700xt", "Radeon RX 5700 XT", 8, 225, 600, "2x8", 270, 16, 88, /RX 5700/),
  gpu("rx-6600", "Radeon RX 6600 (XT)", 8, 132, 500, "1x8", 230, 8, 82, /RX 66[05]0/),
  gpu("rx-6700xt", "Radeon RX 6700 XT", 12, 230, 650, "2x8", 270, 16, 112, /RX 67[05]0/),
  gpu("rx-6800", "Radeon RX 6800 (XT)", 16, 250, 650, "2x8", 290, 16, 145, /RX 6800/),
  gpu("rx-7600", "Radeon RX 7600", 8, 165, 550, "1x8", 240, 8, 92, /RX 7600/),
  gpu("rx-7800xt", "Radeon RX 7800 XT", 16, 263, 700, "2x8", 280, 16, 150, /RX 7800/),
  // Génération actuelle, proposée à l'achat
  gpu("rtx-5060", "GeForce RTX 5060 8 Go", 8, 145, 550, "1x8", 240, 8, 112, /RTX 5060(?! Ti)/, { avail: "new", price: 300 }),
  gpu("rtx-5060ti-16", "GeForce RTX 5060 Ti 16 Go", 16, 180, 600, "1x8", 280, 8, 128, /RTX 5060 Ti/, { avail: "new", price: 440 }),
  gpu("rtx-5070", "GeForce RTX 5070 12 Go", 12, 250, 650, "12V-2x6", 300, 16, 162, /RTX 5070(?! Ti)/, { avail: "new", price: 560 }),
  gpu("rtx-5070ti", "GeForce RTX 5070 Ti 16 Go", 16, 300, 750, "12V-2x6", 330, 16, 205, /RTX 5070 Ti/, { avail: "new", price: 800 }),
  gpu("rtx-5080", "GeForce RTX 5080 16 Go", 16, 360, 850, "12V-2x6", 340, 16, 245, /RTX 5080/, { avail: "new", price: 1100 }),
  gpu("rx-9060xt-16", "Radeon RX 9060 XT 16 Go", 16, 182, 550, "1x8", 270, 16, 122, /RX 9060/, { avail: "new", price: 370 }),
  gpu("rx-9070", "Radeon RX 9070 16 Go", 16, 220, 650, "2x8", 300, 16, 175, /RX 9070(?! XT)/, { avail: "new", price: 600 }),
  gpu("rx-9070xt", "Radeon RX 9070 XT 16 Go", 16, 304, 750, "2x8", 330, 16, 195, /RX 9070 XT/, { avail: "new", price: 680 }),
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

export const SSDS: SsdSpec[] = [
  ssd("nvme4-1tb", "WD Black SN7100 1 To (NVMe PCIe 4.0)", "NVMe4", 1, 85),
  ssd("nvme4-2tb", "WD Black SN7100 2 To (NVMe PCIe 4.0)", "NVMe4", 2, 150),
  ssd("nvme3-1tb", "Crucial P3 1 To (NVMe PCIe 3.0)", "NVMe3", 1, 70),
  ssd("nvme3-2tb", "Crucial P3 2 To (NVMe PCIe 3.0)", "NVMe3", 2, 125),
  ssd("sata-1tb", "Crucial MX500 1 To (SATA)", "SATA", 1, 75),
  ssd("sata-2tb", "Crucial MX500 2 To (SATA)", "SATA", 2, 135),
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

export const findCpu = (name?: string) => (name ? CPUS.find((c) => c.match.test(name)) : undefined);
export const findGpu = (name?: string) => (name ? GPUS.find((g) => g.match.test(name)) : undefined);
export const findBoard = (name?: string) => (name ? BOARDS.find((b) => b.match?.test(name)) : undefined);

export function findChipset(boardName?: string): ChipsetSpec | undefined {
  const m = boardName?.toUpperCase().match(/\b([ABHXZ]\d{3})[EM]?\b/);
  return m ? CHIPSETS.find((c) => c.chipset === m[1]) : undefined;
}
