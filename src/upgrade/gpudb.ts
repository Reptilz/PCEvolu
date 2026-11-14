// Cartes graphiques : table de référence (2016 → 2026) et estimation pour les modèles absents.
//
// perf : indice de performance en jeu 1440p, RTX 3060 Ti = 100 (ordre de grandeur, pas un benchmark).
// tbp : consommation de la carte, psuRec : alimentation conseillée par le fabricant,
// lengthMm : longueur typique des modèles partenaires, lanes : lignes PCIe utilisées.

import type { Availability, GpuPower, GpuSpec } from "./types";

type Row = [id: string, name: string, vram: number, tbp: number, psuRec: number, power: GpuPower, lengthMm: number, lanes: 4 | 8 | 16, perf: number, match: RegExp];

const NVIDIA: Row[] = [
  // GeForce 10 / 16
  ["gtx-1050", "GeForce GTX 1050", 2, 75, 300, "none", 180, 16, 22, /gtx 1050(?! ?ti)/],
  ["gtx-1050ti", "GeForce GTX 1050 Ti", 4, 75, 300, "none", 190, 16, 28, /gtx 1050 ?ti/],
  ["gtx-1060-3", "GeForce GTX 1060 3 Go", 3, 120, 400, "1x6", 230, 16, 40, /gtx 1060.*3 ?g/],
  ["gtx-1060", "GeForce GTX 1060 6 Go", 6, 120, 400, "1x6", 230, 16, 44, /gtx 1060/],
  ["gtx-1070", "GeForce GTX 1070", 8, 150, 500, "1x8", 260, 16, 57, /gtx 1070(?! ?ti)/],
  ["gtx-1070ti", "GeForce GTX 1070 Ti", 8, 180, 500, "1x8", 270, 16, 63, /gtx 1070 ?ti/],
  ["gtx-1080", "GeForce GTX 1080", 8, 180, 500, "1x8", 270, 16, 68, /gtx 1080(?! ?ti)/],
  ["gtx-1080ti", "GeForce GTX 1080 Ti", 11, 250, 600, "2x8", 280, 16, 85, /gtx 1080 ?ti/],
  ["gtx-1650", "GeForce GTX 1650", 4, 75, 300, "none", 190, 16, 32, /gtx 1650(?! ?super)/],
  ["gtx-1650s", "GeForce GTX 1650 Super", 4, 100, 350, "1x6", 200, 16, 42, /gtx 1650 ?super/],
  ["gtx-1660", "GeForce GTX 1660", 6, 120, 450, "1x8", 220, 16, 48, /gtx 1660(?! ?(super|ti))/],
  ["gtx-1660s", "GeForce GTX 1660 Super", 6, 125, 450, "1x8", 220, 16, 53, /gtx 1660 ?super/],
  ["gtx-1660ti", "GeForce GTX 1660 Ti", 6, 120, 450, "1x8", 220, 16, 54, /gtx 1660 ?ti/],
  // RTX 20
  ["rtx-2060", "GeForce RTX 2060", 6, 160, 500, "1x8", 240, 16, 66, /rtx 2060(?! ?super)/],
  ["rtx-2060s", "GeForce RTX 2060 Super", 8, 175, 550, "1x8", 250, 16, 76, /rtx 2060 ?super/],
  ["rtx-2070", "GeForce RTX 2070", 8, 175, 550, "1x8", 260, 16, 79, /rtx 2070(?! ?super)/],
  ["rtx-2070s", "GeForce RTX 2070 Super", 8, 215, 650, "2x8", 270, 16, 87, /rtx 2070 ?super/],
  ["rtx-2080", "GeForce RTX 2080", 8, 215, 650, "2x8", 270, 16, 92, /rtx 2080(?! ?(super|ti))/],
  ["rtx-2080s", "GeForce RTX 2080 Super", 8, 250, 650, "2x8", 270, 16, 96, /rtx 2080 ?super/],
  ["rtx-2080ti", "GeForce RTX 2080 Ti", 11, 250, 650, "2x8", 280, 16, 113, /rtx 2080 ?ti/],
  // RTX 30
  ["rtx-3050", "GeForce RTX 3050", 8, 130, 550, "1x8", 230, 8, 52, /rtx 3050/],
  ["rtx-3060", "GeForce RTX 3060", 12, 170, 550, "1x8", 240, 16, 78, /rtx 3060(?! ?ti)/],
  ["rtx-3060ti", "GeForce RTX 3060 Ti", 8, 200, 600, "1x8", 250, 16, 100, /rtx 3060 ?ti/],
  ["rtx-3070", "GeForce RTX 3070", 8, 220, 650, "2x8", 270, 16, 113, /rtx 3070(?! ?ti)/],
  ["rtx-3070ti", "GeForce RTX 3070 Ti", 8, 290, 750, "2x8", 285, 16, 120, /rtx 3070 ?ti/],
  ["rtx-3080", "GeForce RTX 3080", 10, 320, 750, "2x8", 300, 16, 145, /rtx 3080(?! ?ti)/],
  ["rtx-3080ti", "GeForce RTX 3080 Ti", 12, 350, 750, "2x8", 300, 16, 160, /rtx 3080 ?ti/],
  ["rtx-3090", "GeForce RTX 3090", 24, 350, 750, "2x8", 310, 16, 165, /rtx 3090(?! ?ti)/],
  ["rtx-3090ti", "GeForce RTX 3090 Ti", 24, 450, 850, "12V-2x6", 320, 16, 178, /rtx 3090 ?ti/],
  // RTX 40
  ["rtx-4060", "GeForce RTX 4060", 8, 115, 550, "1x8", 230, 8, 92, /rtx 4060(?! ?ti)/],
  ["rtx-4060ti", "GeForce RTX 4060 Ti", 8, 160, 550, "1x8", 250, 8, 106, /rtx 4060 ?ti/],
  ["rtx-4070", "GeForce RTX 4070", 12, 200, 650, "12V-2x6", 260, 16, 145, /rtx 4070(?! ?(super|ti))/],
  ["rtx-4070s", "GeForce RTX 4070 Super", 12, 220, 650, "12V-2x6", 270, 16, 165, /rtx 4070 ?super/],
  ["rtx-4070ti", "GeForce RTX 4070 Ti", 12, 285, 700, "12V-2x6", 300, 16, 178, /rtx 4070 ?ti(?! ?super)/],
  ["rtx-4070tis", "GeForce RTX 4070 Ti Super", 16, 285, 700, "12V-2x6", 300, 16, 192, /rtx 4070 ?ti ?super/],
  ["rtx-4080", "GeForce RTX 4080", 16, 320, 750, "12V-2x6", 330, 16, 220, /rtx 4080(?! ?super)/],
  ["rtx-4080s", "GeForce RTX 4080 Super", 16, 320, 750, "12V-2x6", 330, 16, 224, /rtx 4080 ?super/],
  ["rtx-4090", "GeForce RTX 4090", 24, 450, 850, "12V-2x6", 340, 16, 285, /rtx 4090/],
  // RTX 50
  ["rtx-5050", "GeForce RTX 5050", 8, 130, 550, "1x8", 220, 8, 82, /rtx 5050/],
  ["rtx-5060", "GeForce RTX 5060 8 Go", 8, 145, 550, "1x8", 240, 8, 112, /rtx 5060(?! ?ti)/],
  ["rtx-5060ti-8", "GeForce RTX 5060 Ti 8 Go", 8, 180, 600, "1x8", 280, 8, 125, /rtx 5060 ?ti.*\b8 ?g/],
  ["rtx-5060ti-16", "GeForce RTX 5060 Ti 16 Go", 16, 180, 600, "1x8", 280, 8, 128, /rtx 5060 ?ti/],
  ["rtx-5070", "GeForce RTX 5070 12 Go", 12, 250, 650, "12V-2x6", 300, 16, 162, /rtx 5070(?! ?ti)/],
  ["rtx-5070ti", "GeForce RTX 5070 Ti 16 Go", 16, 300, 750, "12V-2x6", 330, 16, 205, /rtx 5070 ?ti/],
  ["rtx-5080", "GeForce RTX 5080 16 Go", 16, 360, 850, "12V-2x6", 340, 16, 245, /rtx 5080/],
  ["rtx-5090", "GeForce RTX 5090 32 Go", 32, 575, 1000, "12V-2x6", 340, 16, 330, /rtx 5090/],
];

const AMD: Row[] = [
  ["rx-460", "Radeon RX 460 / 560", 4, 75, 350, "none", 180, 8, 19, /rx 5?[46]60(?!0)/],
  ["rx-470", "Radeon RX 470 / 570", 4, 150, 450, "1x8", 230, 16, 38, /rx [45]70(?!0)/],
  ["rx-480", "Radeon RX 480 / 580", 8, 185, 500, "1x8", 240, 16, 44, /rx [45]80(?!0)/],
  ["rx-590", "Radeon RX 590", 8, 225, 500, "1x8", 250, 16, 49, /rx 590(?!0)/],
  ["vega-56", "Radeon RX Vega 56", 8, 210, 650, "2x8", 270, 16, 62, /vega 56/],
  ["vega-64", "Radeon RX Vega 64", 8, 295, 750, "2x8", 280, 16, 68, /vega 64/],
  ["rx-5500xt", "Radeon RX 5500 XT", 8, 130, 450, "1x8", 220, 8, 45, /rx 5500/],
  ["rx-5600xt", "Radeon RX 5600 XT", 6, 150, 550, "1x8", 240, 16, 72, /rx 5600/],
  ["rx-5700", "Radeon RX 5700", 8, 180, 600, "2x8", 260, 16, 78, /rx 5700(?! ?xt)/],
  ["rx-5700xt", "Radeon RX 5700 XT", 8, 225, 600, "2x8", 270, 16, 88, /rx 5700 ?xt/],
  ["rx-6400", "Radeon RX 6400", 4, 53, 300, "none", 170, 4, 30, /rx 6400/],
  ["rx-6500xt", "Radeon RX 6500 XT", 4, 107, 400, "1x6", 200, 4, 33, /rx 6500/],
  ["rx-6600", "Radeon RX 6600", 8, 132, 450, "1x8", 230, 8, 82, /rx 6600(?! ?xt)/],
  ["rx-6600xt", "Radeon RX 6600 XT / 6650 XT", 8, 170, 500, "1x8", 240, 8, 94, /rx 66[05]0 ?xt/],
  ["rx-6700", "Radeon RX 6700", 10, 175, 550, "1x8", 250, 16, 103, /rx 6700(?! ?xt)/],
  ["rx-6700xt", "Radeon RX 6700 XT / 6750 XT", 12, 230, 650, "2x8", 270, 16, 114, /rx 67[05]0 ?xt/],
  ["rx-6800", "Radeon RX 6800", 16, 250, 650, "2x8", 280, 16, 140, /rx 6800(?! ?xt)/],
  ["rx-6800xt", "Radeon RX 6800 XT", 16, 300, 750, "2x8", 300, 16, 162, /rx 6800 ?xt/],
  ["rx-6900xt", "Radeon RX 6900 XT / 6950 XT", 16, 335, 850, "2x8", 300, 16, 177, /rx 69[05]0/],
  ["rx-7600", "Radeon RX 7600 / 7600 XT", 8, 165, 550, "1x8", 240, 8, 93, /rx 7600/],
  ["rx-7700xt", "Radeon RX 7700 XT", 12, 245, 700, "2x8", 270, 16, 130, /rx 7700/],
  ["rx-7800xt", "Radeon RX 7800 XT", 16, 263, 700, "2x8", 280, 16, 155, /rx 7800/],
  ["rx-7900gre", "Radeon RX 7900 GRE", 16, 260, 700, "2x8", 280, 16, 170, /rx 7900 ?gre/],
  ["rx-7900xt", "Radeon RX 7900 XT", 20, 315, 750, "2x8", 300, 16, 200, /rx 7900 ?xt(?! ?x)/],
  ["rx-7900xtx", "Radeon RX 7900 XTX", 24, 355, 800, "2x8", 320, 16, 230, /rx 7900 ?xtx/],
  ["rx-9060xt-8", "Radeon RX 9060 XT 8 Go", 8, 150, 450, "1x8", 260, 16, 116, /rx 9060 ?xt.*\b8 ?g/],
  ["rx-9060xt-16", "Radeon RX 9060 XT 16 Go", 16, 160, 450, "1x8", 270, 16, 122, /rx 9060/],
  ["rx-9070", "Radeon RX 9070 16 Go", 16, 220, 650, "2x8", 300, 16, 175, /rx 9070(?! ?xt)/],
  ["rx-9070xt", "Radeon RX 9070 XT 16 Go", 16, 304, 750, "2x8", 330, 16, 195, /rx 9070 ?xt/],
];

const INTEL: Row[] = [
  ["arc-a380", "Intel Arc A380", 6, 75, 400, "none", 190, 8, 30, /arc a380/],
  ["arc-a580", "Intel Arc A580", 8, 185, 550, "2x8", 250, 16, 75, /arc a580/],
  ["arc-a750", "Intel Arc A750", 8, 225, 600, "8+6", 270, 16, 82, /arc a750/],
  ["arc-a770", "Intel Arc A770", 16, 225, 600, "8+6", 270, 16, 90, /arc a770/],
  ["arc-b570", "Intel Arc B570", 10, 150, 450, "1x8", 250, 8, 85, /arc b570/],
  ["arc-b580", "Intel Arc B580", 12, 190, 600, "1x8", 270, 8, 95, /arc b580/],
];

/** Puces graphiques intégrées au processeur (pas de carte graphique). */
const INTEGRATED: Row[] = [
  ["igpu-intel", "Graphiques intégrés Intel", 0, 0, 250, "none", 0, 16, 7, /intel.*(uhd|hd graphics|iris)|intel graphics|intel arc graphics/],
  ["igpu-amd-780m", "Radeon 780M / 890M (intégrée)", 0, 0, 250, "none", 0, 16, 22, /radeon 7[68]0m|radeon 8[89]0m/],
  ["igpu-amd", "Graphiques intégrés AMD (Radeon / Vega)", 0, 0, 250, "none", 0, 16, 12, /radeon\s*(\(tm\))?\s*graphics|vega \d+ graphics|radeon vega(?! (56|64))/],
];

function toSpec(r: Row, brand: GpuSpec["brand"], extra: Partial<GpuSpec> = {}): GpuSpec {
  const [id, name, vramGb, tbp, psuRec, power, lengthMm, pcieLanes, perf, match] = r;
  return { kind: "gpu", id, name, brand, vramGb, tbp, psuRec, power, lengthMm, pcieLanes, perf, match, availability: null, ...extra };
}

/** Cartes proposées à l'achat (prix indicatif, remplacé chaque semaine par le relevé). */
const FOR_SALE: Record<string, { price: number; availability: Availability }> = {
  // Génération précédente encore en vente (fins de séries, souvent bon rapport qualité/prix)
  "rtx-4060": { price: 330, availability: "new" },
  "rtx-4060ti": { price: 450, availability: "new" },
  "rtx-4070s": { price: 750, availability: "new" },
  "rx-7600": { price: 320, availability: "new" },
  "rx-7700xt": { price: 520, availability: "new" },
  "rx-7800xt": { price: 650, availability: "new" },
  "rx-7900gre": { price: 700, availability: "new" },
  "rx-7900xt": { price: 850, availability: "new" },
  "arc-a750": { price: 250, availability: "new" },
  // Génération actuelle
  "rtx-5050": { price: 330, availability: "new" },
  "rtx-5060": { price: 500, availability: "new" },
  "rtx-5060ti-16": { price: 920, availability: "new" },
  "rtx-5070": { price: 1000, availability: "new" },
  "rtx-5070ti": { price: 1700, availability: "new" },
  "rtx-5080": { price: 1950, availability: "new" },
  "rtx-5090": { price: 3800, availability: "new" },
  "rx-9060xt-8": { price: 520, availability: "new" },
  "rx-9060xt-16": { price: 760, availability: "new" },
  "rx-9070": { price: 900, availability: "new" },
  "rx-9070xt": { price: 1050, availability: "new" },
  "arc-b570": { price: 300, availability: "new" },
  "arc-b580": { price: 380, availability: "new" },
};

/**
 * Vérifications sur fiches officielles (14 novembre 2026) : consommation, alimentation conseillée, connecteur.
 * - specUrl : la fiche du fabricant de la puce ;
 * - lengthMaxMm : longueur des modèles courants les plus longs, relevée sur les fiches des marques (ASUS, MSI,
 *   Gigabyte, Sapphire, PowerColor…) ; le contrôle « place dans le boîtier » s'appuie dessus ;
 * - powerNote : branchement différent selon le modèle partenaire.
 */
const VERIFIED: Record<string, Partial<GpuSpec>> = {
  "rtx-4060ti": { powerNote: "La Founders Edition utilise un connecteur 16 broches (adaptateur fourni) ; la plupart des modèles partenaires, un câble 8 broches." },
  "rtx-4070": { specUrl: "https://www.nvidia.com/en-us/geforce/graphics-cards/40-series/rtx-4070-family/", powerNote: "Beaucoup de modèles partenaires utilisent simplement un câble PCIe 8 broches au lieu du connecteur 16 broches." },
  "rtx-4070s": { specUrl: "https://www.nvidia.com/en-us/geforce/graphics-cards/40-series/rtx-4070-family/", powerNote: "Beaucoup de modèles partenaires utilisent simplement un câble PCIe 8 broches au lieu du connecteur 16 broches." },
  "rtx-3070": { specUrl: "https://www.nvidia.com/en-us/geforce/graphics-cards/30-series/rtx-3070-3070ti/", powerNote: "Selon le modèle : 1 ou 2 câbles PCIe 8 broches (parfois 8 + 6 broches)." },
  "rtx-5060": { lengthMaxMm: 303 },
  "rtx-5060ti-16": { lengthMaxMm: 306, powerNote: "Quelques modèles (ASUS TUF) utilisent un connecteur 16 broches au lieu du câble 8 broches." },
  "rtx-5070": { lengthMaxMm: 338 },
  "rtx-5070ti": { lengthMaxMm: 340 },
  "rx-9060xt-8": { specUrl: "https://www.amd.com/en/products/graphics/desktops/radeon/9000-series/amd-radeon-rx-9060xt-8gb.html" },
  "rx-9060xt-16": { specUrl: "https://www.amd.com/en/products/graphics/desktops/radeon/9000-series/amd-radeon-rx-9060xt.html", lengthMaxMm: 310 },
  "rx-9070xt": { lengthMaxMm: 340, powerNote: "Selon le modèle : 2 câbles 8 broches (Sapphire Pulse, PowerColor Reaper), 3 câbles 8 broches (Gigabyte Gaming OC, PowerColor Red Devil) ou un connecteur 12V-2x6 (Sapphire NITRO+). Les modèles overclockés conseillent 850 à 900 W." },
  "rx-7900xt": { powerNote: "Certains modèles haut de gamme (Sapphire NITRO+) demandent 3 câbles 8 broches." },
  "rx-7900xtx": { powerNote: "Certains modèles haut de gamme (Sapphire NITRO+) demandent 3 câbles 8 broches." },
  "arc-a750": { specUrl: "https://www.intel.com/content/www/us/en/support/articles/000091128/graphics/intel-arc-dedicated-graphics-family.html" },
  "arc-b580": { specUrl: "https://www.intel.com/content/www/us/en/products/sku/241598/intel-arc-b580-graphics/specifications.html" },
};

const withSale = (s: GpuSpec): GpuSpec => ({ ...s, ...(FOR_SALE[s.id] ?? {}), ...(VERIFIED[s.id] ?? {}) });

export const GPU_TABLE: GpuSpec[] = [
  ...NVIDIA.map((r) => withSale(toSpec(r, "NVIDIA"))),
  ...AMD.map((r) => withSale(toSpec(r, "AMD"))),
  ...INTEL.map((r) => withSale(toSpec(r, "Intel"))),
];

export const INTEGRATED_GPUS: GpuSpec[] = INTEGRATED.map((r) =>
  toSpec(r, r[0].includes("amd") ? "AMD" : "Intel", { integrated: true }),
);

const norm = (s: string) => s.toLowerCase().replace(/\((r|tm)\)/g, " ").replace(/\s+/g, " ");

/** Clé numérique pour rapprocher deux modèles : génération × 100 + gamme (+5 pour Ti / Super / XT). */
function modelKey(name: string): { family: string; key: number } | undefined {
  const n = norm(name);
  let m = n.match(/(rtx|gtx) ?(\d{2})(\d{2})( ?ti| ?super)?/);
  if (m) return { family: "nvidia", key: Number(m[2]) * 100 + Number(m[3]) + (m[4] ? 5 : 0) };
  // XT / XTX = version plus rapide ; GRE = version allégée, rangée avec le modèle de base.
  m = n.match(/rx ?(\d)(\d{3})( ?xtx| ?xt)?/);
  if (m) return { family: "amd", key: Number(m[1]) * 1000 + Number(m[2]) + (m[3] ? 25 : 0) };
  return undefined;
}

/**
 * Retrouve une carte graphique à partir du nom donné par Windows.
 * - modèle connu → caractéristiques exactes ;
 * - version portable (« Laptop GPU », « Max-Q ») → ≈ 70 % des performances de la version de bureau ;
 * - modèle inconnu de la même famille → estimation à partir du modèle le plus proche.
 */
export function findGpuSpec(raw?: string): GpuSpec | undefined {
  if (!raw) return undefined;
  const n = norm(raw);
  const mobile = /laptop|mobile|max-?q|\bm\b/.test(n);

  const integrated = INTEGRATED_GPUS.find((g) => g.match.test(n));
  if (integrated && !/(rtx|gtx|rx \d{3,4}|arc [ab]\d)/.test(n)) return integrated;

  let spec = GPU_TABLE.find((g) => g.match.test(n));
  let estimated = false;
  if (!spec) {
    const k = modelKey(n);
    if (!k) return undefined;
    const candidates = GPU_TABLE.map((g) => ({ g, k: modelKey(g.name) })).filter((c) => c.k?.family === k.family);
    const best = candidates.sort((a, b) => Math.abs(a.k!.key - k.key) - Math.abs(b.k!.key - k.key))[0];
    if (!best) return undefined;
    spec = { ...best.g, id: `estimate-${best.g.id}`, name: raw.replace(/\((r|tm)\)/gi, "").trim() };
    estimated = true;
  }
  if (mobile) {
    return {
      ...spec,
      id: `${spec.id}-laptop`,
      name: `${spec.name} (portable)`,
      perf: Math.round(spec.perf * 0.7),
      tbp: Math.round(spec.tbp * 0.55),
      mobile: true,
      estimated,
      availability: null,
      price: undefined,
    };
  }
  return estimated ? { ...spec, estimated: true, availability: null, price: undefined } : spec;
}
