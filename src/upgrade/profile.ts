// Profil de compatibilité : tout ce qu'il faut savoir de la config actuelle pour juger un upgrade.
// Il combine le scan matériel et les réponses de l'utilisateur pour ce qui ne se détecte pas.

import type { Report } from "../types";
import type { BoardSpec, ChipsetSpec, CpuSpec, FormFactor, GpuSpec, RamType, Socket } from "./types";
import { CASE_GPU_LENGTH, COOLER_CAPACITY, OEM_BRANDS, findBoard, findChipset, findCpu, findGpu } from "./catalog";
import { clean } from "../format";

// ---------------------------------------------------------------------------
// Réponses au questionnaire (ce que Windows ne peut pas lire)
// ---------------------------------------------------------------------------

export type CoolerAnswer = "stock" | "tower-single" | "tower-dual" | "aio-240" | "aio-360" | "unknown";
export type CaseAnswer = "small" | "mid" | "full" | "unknown";

export interface Answers {
  /** Puissance de l'alimentation en watts, null = inconnue. */
  psuWatts: number | null;
  psu12v2x6: "yes" | "no" | "unknown";
  caseSize: CaseAnswer;
  /** Longueur max de carte graphique si l'utilisateur la connaît (fiche du boîtier). */
  gpuMaxMm: number | null;
  /** Nombre de ventilateurs de boîtier (3 = 3 ou plus), null = inconnu. */
  caseFans: number | null;
  cooler: CoolerAnswer;
}

export const DEFAULT_ANSWERS: Answers = {
  psuWatts: null,
  psu12v2x6: "unknown",
  caseSize: "unknown",
  gpuMaxMm: null,
  caseFans: null,
  cooler: "unknown",
};

const KEY = "pcevolu.answers.v1";

export function loadAnswers(): Answers {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_ANSWERS, ...JSON.parse(raw) } : DEFAULT_ANSWERS;
  } catch {
    return DEFAULT_ANSWERS;
  }
}

export function saveAnswers(a: Answers) {
  try {
    localStorage.setItem(KEY, JSON.stringify(a));
  } catch {
    /* stockage indisponible : les réponses restent en mémoire */
  }
}

/** Nombre de questions encore sans réponse. */
export function missingAnswers(a: Answers): number {
  return [a.psuWatts == null, a.caseSize === "unknown" && a.gpuMaxMm == null, a.caseFans == null, a.cooler === "unknown"].filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// Profil
// ---------------------------------------------------------------------------

export interface Profile {
  cpuName?: string;
  /** Nom lisible du processeur réellement installé (ex. « Intel Core i5-10600KF »). */
  cpuDisplay: string;
  cpu?: CpuSpec;
  gpuName?: string;
  gpu?: GpuSpec;
  boardName?: string;
  board?: BoardSpec;
  chipset?: ChipsetSpec;
  socket?: Socket;
  formFactor?: FormFactor;
  /** PC portable : processeur et carte graphique soudés. */
  isLaptop: boolean;
  /** PC de marque (Dell, HP, Lenovo…) : alimentation, carte mère et boîtier souvent propriétaires. */
  isOem: boolean;
  manufacturer?: string;

  ramType?: RamType;
  ramModules: number;
  ramStickGb?: number;
  ramTotalGb: number;
  ramSlots: number;
  ramMaxGb?: number;
  ramMts?: number;
  /** Vitesse max que la RAM peut atteindre sur cette plateforme (CPU + chipset). */
  ramPlatformMaxMts?: number;
  ramPartNumber?: string;
  /** Emplacement de la première barrette (ex. « ChannelA-DIMM1 »). */
  ramSlotName?: string;

  /** Génération PCIe effective du port de la carte graphique. */
  pcieGen?: 3 | 4 | 5;
  m2Total?: number;
  m2Used: number;
  systemDiskFreeRatio?: number;

  psuWatts: number;
  psuKnown: boolean;
  psu12v2x6?: boolean;
  gpuMaxMm?: number;
  caseFans?: number;
  coolerW?: number;
  cooler: CoolerAnswer;
}

const GB = 1024 ** 3;

export function buildProfile(r: Report, a: Answers): Profile {
  const cpuName = r.cpus[0]?.name;
  const gpuName = r.gpus[0]?.name;
  const boardName = r.board.product;
  const cpu = findCpu(cpuName);
  const gpu = findGpu(gpuName);
  const board = findBoard(boardName);
  const chipset = findChipset(boardName);
  const socket = board?.socket ?? chipset?.socket ?? cpu?.socket;

  const mods = r.memory.modules;
  const kind = mods[0]?.kind;
  const ramType = (kind === "DDR3" || kind === "DDR4" || kind === "DDR5" ? kind : undefined) ?? board?.ramType;
  const ramMts = mods[0]?.configuredMts ?? mods[0]?.speedMts;
  const cpuRamMax = ramType ? cpu?.ramMaxMts[ramType] : undefined;
  // Sans overclocking mémoire autorisé, la RAM est bridée à la vitesse officielle du processeur.
  const ramPlatformMaxMts = chipset && !chipset.ramOc ? cpuRamMax : cpuRamMax ? Math.max(cpuRamMax, 3600) : undefined;

  // Les processeurs Intel de 10e génération limitent le port graphique au PCIe 3.0, quelle que soit la carte mère.
  let pcieGen = board?.pcieGpu ?? chipset?.pcieGpu;
  if (pcieGen && cpu?.gen === "intel-10") pcieGen = 3;
  if (pcieGen && cpu?.gen === "amd-zen1") pcieGen = 3;
  // Carte mère non reconnue : on déduit la génération PCIe du processeur.
  if (!pcieGen && cpu) {
    const g = cpu.gen;
    pcieGen = g === "intel-12" || g === "intel-13" || g === "intel-14" || g === "amd-zen2" || g === "amd-zen3" ? 4
      : g === "intel-ultra2" || g === "amd-zen4" || g === "amd-zen5" ? 4 : 3;
  }

  const isLaptop = r.system.isLaptop || !!cpu?.mobile || !!gpu?.mobile;
  const isOem = !isLaptop && OEM_BRANDS.test(r.system.manufacturer ?? "");

  const sys = r.volumes.find((v) => v.letter === "C:") ?? r.volumes[0];

  // Alimentation inconnue : on suppose qu'elle correspond au minimum recommandé pour la carte actuelle.
  // Sans carte graphique dédiée, un PC de marque a souvent une petite alim (180-300 W).
  const psuKnown = a.psuWatts != null;
  const psuWatts = a.psuWatts ?? (gpu && !gpu.integrated ? gpu.psuRec : isOem ? 250 : 400);

  const gpuMaxMm = a.gpuMaxMm ?? (a.caseSize !== "unknown" ? CASE_GPU_LENGTH[a.caseSize] : undefined);

  return {
    cpuName, cpu, gpuName, gpu,
    cpuDisplay: clean(cpuName) || cpu?.name || "processeur", boardName, board, chipset, socket,
    formFactor: board?.formFactor ?? (a.caseSize === "small" ? "mATX" : undefined),
    isLaptop, isOem, manufacturer: r.system.manufacturer,
    ramType,
    ramModules: mods.length,
    ramStickGb: mods[0]?.capacityBytes ? Math.round(mods[0].capacityBytes / GB) : undefined,
    ramTotalGb: Math.round(r.memory.totalBytes / GB),
    ramSlots: board?.ramSlots ?? r.memory.slotsTotal ?? mods.length,
    ramMaxGb: board?.maxRamGb ?? (r.memory.maxCapacityBytes ? Math.round(r.memory.maxCapacityBytes / GB) : undefined),
    ramMts,
    ramPlatformMaxMts,
    ramPartNumber: mods[0]?.partNumber,
    ramSlotName: mods[0]?.slot,
    pcieGen,
    m2Total: board?.m2Slots,
    m2Used: r.disks.filter((d) => d.bus === "NVMe").length,
    systemDiskFreeRatio: sys?.sizeBytes && sys.freeBytes != null ? sys.freeBytes / sys.sizeBytes : undefined,
    psuWatts,
    psuKnown,
    psu12v2x6: a.psu12v2x6 === "unknown" ? undefined : a.psu12v2x6 === "yes",
    gpuMaxMm,
    caseFans: a.caseFans ?? undefined,
    coolerW: a.cooler !== "unknown" ? COOLER_CAPACITY[a.cooler] : undefined,
    cooler: a.cooler,
  };
}
