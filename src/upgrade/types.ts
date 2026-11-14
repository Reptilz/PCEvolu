// Modèle de données du catalogue de composants et des propositions d'upgrade.

export type Socket = "LGA1151" | "LGA1200" | "LGA1700" | "LGA1851" | "AM4" | "AM5";
export type RamType = "DDR4" | "DDR5";
export type FormFactor = "ATX" | "mATX" | "ITX";

/** Génération de processeur, utilisée pour savoir quel chipset le supporte. */
export type CpuGen =
  | "intel-8" | "intel-9" | "intel-10" | "intel-11" | "intel-12" | "intel-13" | "intel-14" | "intel-ultra2"
  | "amd-zen1" | "amd-zen2" | "amd-zen3" | "amd-zen4" | "amd-zen5";

/** "new" = vendu neuf, "used" = surtout en occasion / fin de stock, null = pas proposé à l'achat. */
export type Availability = "new" | "used" | null;

export interface CpuSpec {
  kind: "cpu";
  id: string;
  name: string;
  brand: "Intel" | "AMD";
  socket: Socket;
  gen: CpuGen;
  cores: number;
  threads: number;
  /** Consommation max réaliste (PL2 / PPT), pour dimensionner alim et ventirad. */
  powerW: number;
  /** Indice jeu relatif (Core i5-10600K = 100). */
  gaming: number;
  /** Indice de carte graphique (RTX 3060 Ti = 100) au-delà duquel ce CPU devient le facteur limitant en 1440p. */
  gpuCeiling: number;
  /** Vitesse mémoire max officielle. */
  ramMaxMts: Partial<Record<RamType, number>>;
  igpu: boolean;
  boxCooler: boolean;
  availability: Availability;
  price?: number;
  match: RegExp;
}

export interface ChipsetSpec {
  chipset: string;
  socket: Socket;
  /** Types de RAM possibles selon les modèles de cartes mères. */
  ramTypes: RamType[];
  /** Génération PCIe du port de la carte graphique (avec le CPU le plus récent supporté). */
  pcieGpu: 3 | 4 | 5;
  cpuGens: CpuGen[];
  /** Générations qui nécessitent une mise à jour du BIOS. */
  biosUpdateFor?: CpuGen[];
  /** Overclocking mémoire autorisé (sinon la RAM est bridée à la vitesse officielle du CPU). */
  ramOc: boolean;
}

export interface BoardSpec {
  kind: "board";
  id: string;
  name: string;
  socket: Socket;
  chipset: string;
  formFactor: FormFactor;
  ramType: RamType;
  ramSlots: number;
  maxRamGb: number;
  m2Slots: number;
  pcieGpu: 3 | 4 | 5;
  availability: Availability;
  price?: number;
  note?: string;
  match?: RegExp;
}

export type GpuPower = "1x8" | "2x8" | "3x8" | "12V-2x6";

export interface GpuSpec {
  kind: "gpu";
  id: string;
  name: string;
  brand: "NVIDIA" | "AMD" | "Intel";
  vramGb: number;
  /** Consommation de la carte (TBP). */
  tbp: number;
  /** Alimentation recommandée par le fabricant. */
  psuRec: number;
  power: GpuPower;
  /** Longueur typique des modèles partenaires (mm). */
  lengthMm: number;
  pcieLanes: 8 | 16;
  /** Indice de performance en jeu 1440p (RTX 3060 Ti = 100). */
  perf: number;
  availability: Availability;
  price?: number;
  match: RegExp;
}

export interface RamKit {
  kind: "ram";
  id: string;
  name: string;
  type: RamType;
  sticks: number;
  gbPerStick: number;
  mts: number;
  price: number;
}

export interface SsdSpec {
  kind: "ssd";
  id: string;
  name: string;
  iface: "NVMe3" | "NVMe4" | "SATA";
  tb: number;
  price: number;
}

export interface PsuSpec {
  kind: "psu";
  id: string;
  name: string;
  watts: number;
  atx3: boolean;
  native12v2x6: boolean;
  pcie8pin: number;
  price: number;
}

export interface CoolerSpec {
  kind: "cooler";
  id: string;
  name: string;
  type: "air" | "aio";
  sockets: Socket[];
  /** Puissance CPU qu'il dissipe confortablement (W). */
  capacityW: number;
  price: number;
}

export interface FanKit {
  kind: "fans";
  id: string;
  name: string;
  count: number;
  price: number;
}

export interface CaseSpec {
  kind: "case";
  id: string;
  name: string;
  formFactors: FormFactor[];
  maxGpuMm: number;
  fansIncluded: number;
  price: number;
}

export type Part = CpuSpec | BoardSpec | GpuSpec | RamKit | SsdSpec | PsuSpec | CoolerSpec | FanKit | CaseSpec;

// ---------------------------------------------------------------------------
// Résultat du moteur
// ---------------------------------------------------------------------------

export type CheckStatus = "ok" | "warn" | "fail";

export interface Check {
  label: string;
  status: CheckStatus;
  detail: string;
}

/**
 * required    : sans ce composant, l'upgrade ne fonctionne pas.
 * verify      : probablement nécessaire, selon une info que PCEvolu ne peut pas lire (étiquette de l'alim…).
 * recommended : pas obligatoire, mais conseillé (températures, équilibre de la config).
 */
export type Role = "required" | "verify" | "recommended";

export interface Addition {
  role: Role;
  part: Part;
  quantity: number;
  reason: string;
}

export type Category = "gpu" | "cpu" | "ram" | "storage";

export interface Proposal {
  id: string;
  category: Category;
  title: string;
  main: Part;
  mainQuantity: number;
  gainLabel?: string;
  gainPercent?: number;
  checks: Check[];
  additions: Addition[];
  notes: string[];
  /** Prix du composant principal + composants obligatoires. */
  total: number;
  /** Total en incluant les composants « à vérifier ». */
  totalIfVerify: number;
  highlight?: string;
}
