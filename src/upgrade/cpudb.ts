// Décodeur de processeurs : déduit les caractéristiques utiles d'un processeur à partir de son nom.
//
// « Intel(R) Core(TM) i5-10600KF CPU @ 4.10GHz » → génération 10, gamme i5, K (débloqué), F (sans iGPU)
//   → socket LGA1200, DDR4-2666, ≈ 182 W max, indice jeu 100…
// « AMD Ryzen 7 7800X3D 8-Core Processor » → Zen 4, AM5, DDR5, X3D (cache 3D)…
//
// Couvre les Intel Core de 4e à 14e génération, les Core Ultra 200S, les Pentium/Celeron récents
// et tous les Ryzen (bureau et portables). Les indices sont des ordres de grandeur cohérents entre eux,
// calibrés sur des processeurs de référence ; ce ne sont pas des benchmarks.

import type { CpuGen, CpuSpec, RamType, Socket } from "./types";

// ---------------------------------------------------------------------------
// Intel
// ---------------------------------------------------------------------------

type IntelTier = "i3" | "i5" | "i7" | "i9";
type IntelGen = 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

const INTEL_SOCKET: Record<IntelGen, Socket> = {
  4: "LGA1150", 5: "LGA1150", 6: "LGA1151", 7: "LGA1151", 8: "LGA1151", 9: "LGA1151",
  10: "LGA1200", 11: "LGA1200", 12: "LGA1700", 13: "LGA1700", 14: "LGA1700",
};

/** Indice jeu d'un i5 « K » de chaque génération (i5-10600K = 100). */
const INTEL_I5K_GAMING: Record<IntelGen, number> = {
  4: 62, 5: 64, 6: 72, 7: 77, 8: 86, 9: 90, 10: 100, 11: 106, 12: 140, 13: 152, 14: 156,
};

/** Cœurs / threads selon génération, gamme et position dans la gamme. */
function intelCores(gen: IntelGen, tier: IntelTier, sku: number, k: boolean): [number, number] {
  if (gen <= 7) return tier === "i3" ? [2, 4] : tier === "i5" ? [4, 4] : [4, 8];
  if (gen === 8) return tier === "i3" ? [4, 4] : tier === "i5" ? [6, 6] : [6, 12];
  if (gen === 9) return tier === "i3" ? [4, 4] : tier === "i5" ? [6, 6] : tier === "i7" ? [8, 8] : [8, 16];
  if (gen === 10) return tier === "i3" ? [4, 8] : tier === "i5" ? [6, 12] : tier === "i7" ? [8, 16] : [10, 20];
  if (gen === 11) return tier === "i3" ? [4, 8] : tier === "i5" ? [6, 12] : [8, 16];
  // i5 12e gén. : seuls les « K » ont des cœurs E (12600K = 10/16) ; i5-12400, 12500 et 12600 = 6/12 (Intel ARK).
  if (gen === 12) return tier === "i3" ? [4, 8] : tier === "i5" ? (k ? [10, 16] : [6, 12]) : tier === "i7" ? [12, 20] : [16, 24];
  // 13e et 14e génération
  if (tier === "i3") return [4, 8];
  if (tier === "i5") return k || sku >= 500 ? [14, 20] : [10, 16];
  if (tier === "i7") return gen === 14 ? [20, 28] : [16, 24];
  return [24, 32];
}

/** Consommation max réaliste (PL2), en watts. */
function intelPower(gen: IntelGen, tier: IntelTier, k: boolean): number {
  const t = { i3: 0, i5: 1, i7: 2, i9: 3 }[tier];
  const table: Record<string, [number, number, number, number]> = {
    // [i3, i5, i7, i9]   K                    non-K
    "4K": [70, 100, 110, 110], "4": [60, 90, 95, 95],
    "6K": [70, 110, 120, 120], "6": [60, 80, 90, 90],
    "8K": [100, 120, 150, 150], "8": [70, 95, 120, 120],
    "9K": [100, 130, 165, 200], "9": [70, 95, 120, 150],
    "10K": [100, 182, 229, 250], "10": [90, 134, 224, 224],
    "11K": [100, 224, 251, 251], "11": [90, 154, 224, 224],
    "12K": [89, 150, 190, 241], "12": [89, 117, 180, 202],
    "13K": [110, 181, 253, 253], "13": [110, 148, 219, 219],
  };
  const g = gen === 5 ? 4 : gen === 7 ? 6 : gen === 14 ? 13 : gen;
  return table[`${g}${k ? "K" : ""}`][t];
}

function intelRam(gen: IntelGen, tier: IntelTier, k: boolean): Partial<Record<RamType, number>> {
  if (gen <= 5) return { DDR3: 1600 };
  if (gen === 6) return { DDR4: 2133 };
  if (gen === 7) return { DDR4: 2400 };
  if (gen === 8) return { DDR4: tier === "i3" ? 2400 : 2666 };
  if (gen === 9) return { DDR4: 2666 };
  if (gen === 10) return { DDR4: tier === "i3" || tier === "i5" ? 2666 : 2933 };
  if (gen === 11) return { DDR4: 3200 };
  if (gen === 12) return { DDR4: 3200, DDR5: 4800 };
  return { DDR4: 3200, DDR5: k || tier === "i7" || tier === "i9" ? 5600 : 4800 };
}

function intelCore(model: string, tier: IntelTier, gen: IntelGen, sku: number, suffix: string): CpuSpec {
  const k = /k/.test(suffix);
  const f = /f/.test(suffix);
  const mobile = /[hupgy]|hx|hk/.test(suffix.replace(/kf?|ks|f|t/g, ""));
  const mult = { i3: gen >= 12 ? 0.82 : gen <= 7 ? 0.7 : 0.8, i5: 1, i7: gen <= 7 ? 1.1 : 1.08, i9: 1.12 }[tier];
  let gaming = INTEL_I5K_GAMING[gen] * mult;
  if (!k) gaming *= tier === "i5" ? 0.9 : tier === "i3" ? 0.97 : 0.96;
  if (/t/.test(suffix)) gaming *= 0.85;
  if (mobile) gaming *= 0.78;
  const [cores, threads] = intelCores(gen, tier, sku, k);
  return finalize({
    id: `${tier}-${model}`.toLowerCase(),
    name: `Intel Core ${tier}-${model.toUpperCase()}`,
    brand: "Intel",
    socket: INTEL_SOCKET[gen],
    gen: `intel-${gen === 5 ? 4 : gen}` as CpuGen,
    cores, threads,
    powerW: mobile ? 65 : intelPower(gen, tier, k),
    gaming,
    ramMaxMts: intelRam(gen, tier, k),
    igpu: !f,
    boxCooler: !k,
    mobile,
  });
}

function intelUltra(tier: 5 | 7 | 9, sku: number, suffix: string): CpuSpec {
  const k = /k/.test(suffix);
  const mobile = sku < 200 || /[hvu]/.test(suffix);
  const base = { 5: 146, 7: 158, 9: 164 }[tier];
  let gaming = k ? base : base * 0.88;
  if (mobile) gaming *= 0.78;
  const [cores, threads] = tier === 5 ? (k ? [14, 14] : [10, 10]) : tier === 7 ? [20, 20] : [24, 24];
  return finalize({
    id: `u${tier}-${sku}${suffix}`.toLowerCase(),
    name: `Intel Core Ultra ${tier} ${sku}${suffix.toUpperCase()}`,
    brand: "Intel",
    socket: "LGA1851",
    gen: "intel-ultra2",
    cores, threads,
    powerW: mobile ? 65 : k ? (tier === 5 ? 159 : 250) : tier === 5 ? 121 : 182,
    gaming,
    ramMaxMts: { DDR5: 6400 },
    igpu: !/f/.test(suffix),
    boxCooler: !k,
    mobile,
  });
}

/** Pentium / Celeron « G » : seul le numéro indique la génération. */
function intelEntry(model: string, digits: string): CpuSpec | undefined {
  // La numérotation n'est pas régulière : les Celeron G49xx sont des 8e gén., G59xx des 10e, G69xx des 12e.
  const genByPrefix: Record<string, IntelGen> = { "18": 4, "39": 7, "49": 8, "59": 10, "69": 12 };
  const genByDigit: Record<string, IntelGen> = { "3": 4, "4": 6, "5": 8, "6": 10, "7": 12 };
  const gen = genByPrefix[digits.slice(0, 2)] ?? genByDigit[digits[0]];
  if (!gen) return undefined;
  return finalize({
    id: `g${digits}`,
    name: `Intel ${model} G${digits}`,
    brand: "Intel",
    socket: INTEL_SOCKET[gen],
    gen: `intel-${gen}` as CpuGen,
    cores: 2, threads: 4,
    powerW: 60,
    gaming: INTEL_I5K_GAMING[gen] * 0.62,
    ramMaxMts: intelRam(gen, "i3", false),
    igpu: true,
    boxCooler: true,
  });
}

// ---------------------------------------------------------------------------
// AMD Ryzen
// ---------------------------------------------------------------------------

type RyzenTier = 3 | 5 | 7 | 9;

/** Indice jeu d'un Ryzen 5 « X » de chaque génération. */
const RYZEN5X_GAMING: Record<string, number> = { zen1: 72, "zen1+": 78, zen2: 90, zen3: 110, zen4: 152, zen5: 160 };

/** Valeurs connues des puces X3D (cache 3D), nettement plus rapides en jeu. */
const X3D_GAMING: Record<string, number> = {
  "5500": 125, "5600": 135, "5700": 140, "5800": 145,
  "7600": 175, "7800": 185, "7900": 170, "7950": 186,
  "9800": 210, "9900": 195, "9950": 212,
};

function ryzen(tier: RyzenTier, digits: string, suffixRaw: string): CpuSpec {
  const suffix = suffixRaw.toLowerCase();
  const series = digits[0];
  const n = Number(digits);
  const apu = /g/.test(suffix);
  const mobile = /^(h|hs|hx|u|h3d)/.test(suffix) || (["7", "8"].includes(series) && /[2-4]5$|[1-4]0$/.test(digits) && !/^(x|f|$)/.test(suffix));
  const x3d = /x3d/.test(suffix);
  const x = /^x/.test(suffix);

  let arch: string;
  if (series === "1") arch = "zen1";
  else if (series === "2") arch = apu ? "zen1" : "zen1+"; // Ryzen 2000G (Raven Ridge) = Zen 1 ; 2600/2700X = Zen+
  else if (series === "3") arch = apu ? "zen1+" : "zen2";
  else if (series === "4") arch = "zen2";
  else if (series === "5") arch = "zen3";
  else if (series === "7" || series === "8") arch = "zen4";
  else arch = "zen5";

  const gen: CpuGen = arch === "zen1" ? "amd-zen1" : arch === "zen1+" ? "amd-zen1plus" : (`amd-${arch}` as CpuGen);
  const am5 = arch === "zen4" || arch === "zen5";

  // Cœurs / threads
  const sub = digits.slice(1, 3); // « 60 » dans 7600, « 95 » dans 7950
  let cores: number;
  if (tier === 3) cores = 4;
  else if (tier === 5) cores = series === "1" && n < 1600 ? 4 : 6;
  else if (tier === 7) cores = 8;
  else cores = sub.startsWith("95") ? 16 : 12;
  const threads = series === "1" && tier === 3 ? 4 : cores * 2;

  // Indice jeu
  let gaming: number;
  if (x3d && X3D_GAMING[digits]) gaming = X3D_GAMING[digits];
  else {
    gaming = RYZEN5X_GAMING[arch] * { 3: 0.85, 5: 1, 7: 1.04, 9: 1.06 }[tier];
    if (!x) gaming *= 0.96;
    if (apu) gaming *= arch === "zen4" ? 0.82 : 0.86;
  }
  if (mobile) gaming *= 0.78;

  // Consommation (PPT) selon le TDP habituel de chaque modèle
  // PPT = 1,35 × TDP officiel AMD (65 W → 88, 95 W → 128, 105 W → 142, 120 W → 162, 170 W → 230), vérifié sur amd.com.
  let powerW = 88; // TDP 65 W
  if (x && (arch === "zen1" || arch === "zen1+") && tier >= 5) powerW = digits === "2700" ? 142 : 128; // 1600X/1700X/1800X/2600X : 95 W ; 2700X : 105 W
  if (x && arch === "zen2") powerW = tier === 5 ? 128 : tier === 7 && sub === "70" ? 88 : 142; // 3600X 95 W ; 3700X 65 W ; 3800X/3900X/3950X 105 W
  if (x && arch === "zen3") powerW = tier === 5 || (tier === 7 && sub === "70") ? 88 : 142; // 5600X/5700X 65 W ; 5800X/5900X/5950X 105 W
  if (x && arch === "zen4") powerW = tier >= 9 ? 230 : 142;
  if (x && arch === "zen5" && tier >= 9) powerW = sub.startsWith("95") ? 230 : 162;
  if (x3d) powerW = arch === "zen3" ? 142 : arch === "zen5" && sub.startsWith("95") ? 230 : 162; // 9950X3D : 170 W
  if (mobile) powerW = 54;

  const ram: Partial<Record<RamType, number>> =
    arch === "zen1" ? { DDR4: 2666 } : arch === "zen1+" ? { DDR4: 2933 } : arch === "zen4" ? { DDR5: 5200 } : arch === "zen5" ? { DDR5: 5600 } : { DDR4: 3200 };

  const igpu = am5 ? !/f/.test(suffix) : apu;
  const boxCooler = !x3d && (am5 ? !x && !["9"].includes(series) : tier <= 5 || ["1", "2", "3"].includes(series));

  return finalize({
    id: `r${tier}-${digits}${suffix}`,
    name: `AMD Ryzen ${tier} ${digits}${suffix.toUpperCase()}`,
    brand: "AMD",
    socket: am5 ? "AM5" : "AM4",
    gen,
    cores, threads, powerW, gaming,
    ramMaxMts: ram,
    igpu, boxCooler, mobile,
    x3d,
  });
}

// ---------------------------------------------------------------------------

interface Draft {
  id: string; name: string; brand: "Intel" | "AMD"; socket: Socket; gen: CpuGen;
  cores: number; threads: number; powerW: number; gaming: number;
  ramMaxMts: Partial<Record<RamType, number>>; igpu: boolean; boxCooler: boolean; mobile?: boolean; x3d?: boolean;
}

function finalize(d: Draft): CpuSpec {
  const gaming = Math.round(d.gaming);
  // Multitâche : performance par cœur (sans le bonus jeu du cache 3D) × nombre de threads, à rendement décroissant.
  const perCore = d.x3d ? gaming * 0.78 : gaming;
  const multi = Math.round(perCore * Math.pow(d.threads / 12, 0.8));
  return {
    kind: "cpu",
    id: d.id, name: d.name, brand: d.brand, socket: d.socket, gen: d.gen,
    cores: d.cores, threads: d.threads, powerW: d.powerW,
    gaming, multi,
    // Au-delà de cet indice de carte graphique (RTX 3060 Ti = 100), le CPU limite en 1440p.
    gpuCeiling: Math.round(gaming * 1.55),
    ramMaxMts: d.ramMaxMts,
    igpu: d.igpu, boxCooler: d.boxCooler,
    availability: null,
    match: new RegExp(d.id.replace(/^[a-z]\d-|^u\d-|^g/, "").replace(/[-]/g, "[- ]?"), "i"),
    mobile: d.mobile || undefined,
  };
}

/**
 * Déduit les caractéristiques d'un processeur à partir de son nom (tel que Windows le donne).
 * Renvoie undefined si le nom n'est pas reconnu.
 */
export function cpuFromName(raw?: string): CpuSpec | undefined {
  if (!raw) return undefined;
  const s = raw.replace(/\((r|tm)\)/gi, " ").replace(/\s+/g, " ").trim();

  // Core Ultra (« Intel Core Ultra 7 265KF »)
  let m = s.match(/ultra ([579]) (\d{3})([a-z]*)/i);
  if (m) return intelUltra(Number(m[1]) as 5 | 7 | 9, Number(m[2]), m[3].toLowerCase());

  // Core i3/i5/i7/i9
  m = s.match(/\b(i[3579])[- ](\d{4,5})([a-z]{0,2}\d?)/i);
  if (m) {
    const tier = m[1].toLowerCase() as IntelTier;
    const digits = m[2];
    let gen: number;
    if (digits.length === 5) gen = Number(digits.slice(0, 2));
    else if (digits[0] === "1") gen = Number(digits.slice(0, 2)); // portables : i7-1165G7 (11e), i5-1035G1 (10e)
    else gen = Number(digits[0]);
    if (gen < 4 || gen > 14) return undefined;
    const sku = Number(digits.slice(-3));
    return intelCore(digits + m[3].toLowerCase(), tier, gen as IntelGen, sku, m[3].toLowerCase());
  }

  // Pentium / Celeron
  m = s.match(/(pentium(?: gold)?|celeron)[^g]*g(\d{4})/i);
  if (m) return intelEntry(m[1].replace(/\b\w/g, (c) => c.toUpperCase()), m[2]);

  // Ryzen (« AMD Ryzen 7 7800X3D 8-Core Processor », « Ryzen 5 5600G with Radeon Graphics »)
  m = s.match(/ryzen (?:ai )?([3579]) (?:pro )?(\d{4})([a-z0-9]*)/i);
  if (m) return ryzen(Number(m[1]) as RyzenTier, m[2], m[3]);

  return undefined;
}

/** Version « marquée » pour l'achat : mêmes caractéristiques, avec prix et disponibilité. */
export function purchasable(name: string, availability: "new" | "used", price: number, id?: string): CpuSpec {
  const spec = cpuFromName(name);
  if (!spec) throw new Error(`Processeur inconnu dans le catalogue : ${name}`);
  return { ...spec, id: id ?? spec.id, availability, price };
}
