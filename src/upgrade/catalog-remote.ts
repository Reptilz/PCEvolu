// Catalogue téléchargeable : permet d'ajouter des composants sans publier une nouvelle version de l'app.
//
// Le fichier data/catalog.json est produit par « npm run catalog » à partir du code (catalog.ts, gpudb.ts),
// puis publié en ligne. Au démarrage, l'app le télécharge (VITE_CATALOG_URL) et remplace son catalogue
// intégré s'il est plus récent. Les expressions régulières y sont stockées sous forme de texte.

import type { Part } from "./types";
import { BOARDS, CASES, CATALOG_VERSION, CHIPSETS, COOLERS, CPUS, FAN_KITS, GPUS, PSUS, RAM_KITS, SSDS } from "./catalog";

export interface CatalogFile {
  version: number;
  generatedAt: string;
  chipsets: typeof CHIPSETS;
  cpus: unknown[];
  gpus: unknown[];
  boards: unknown[];
  ram: typeof RAM_KITS;
  ssds: typeof SSDS;
  psus: typeof PSUS;
  coolers: typeof COOLERS;
  fans: typeof FAN_KITS;
  cases: typeof CASES;
}

// import.meta.env n'existe que dans l'app (Vite) : absent quand le script d'export tourne sous Node.
export const CATALOG_URL: string | null = import.meta.env?.VITE_CATALOG_URL ?? null;
const CACHE_KEY = "pcevolu.catalog.v1";

/** Expression régulière → texte (pour le JSON), et inversement. */
const reToText = (r?: RegExp) => (r ? { re: r.source, flags: r.flags } : undefined);
const textToRe = (t?: { re: string; flags: string }) => (t ? new RegExp(t.re, t.flags) : undefined);

function serializeParts(parts: Part[]) {
  return parts.map((p) => ("match" in p && p.match ? { ...p, match: reToText(p.match) } : p));
}

/** Produit le contenu de data/catalog.json à partir du catalogue intégré. */
export function exportCatalog(): CatalogFile {
  return {
    version: CATALOG_VERSION,
    generatedAt: new Date().toISOString(),
    chipsets: CHIPSETS,
    cpus: serializeParts(CPUS),
    gpus: serializeParts(GPUS),
    boards: serializeParts(BOARDS),
    ram: RAM_KITS,
    ssds: SSDS,
    psus: PSUS,
    coolers: COOLERS,
    fans: FAN_KITS,
    cases: CASES,
  };
}

/** Remplace le contenu d'une liste sans changer sa référence (les autres modules la gardent). */
function replace<T>(target: T[], items: T[]) {
  target.splice(0, target.length, ...items);
}

function revive<T>(items: unknown[]): T[] {
  return items.map((it) => {
    const o = it as Record<string, unknown>;
    return (o.match ? { ...o, match: textToRe(o.match as { re: string; flags: string }) } : o) as T;
  });
}

function isValid(f: unknown): f is CatalogFile {
  const c = f as CatalogFile;
  return !!c && typeof c.version === "number" && Array.isArray(c.gpus) && Array.isArray(c.cpus) && Array.isArray(c.chipsets) && c.gpus.length > 0;
}

function apply(f: CatalogFile) {
  replace(CHIPSETS, f.chipsets);
  replace(CPUS, revive(f.cpus));
  replace(GPUS, revive(f.gpus));
  replace(BOARDS, revive(f.boards));
  replace(RAM_KITS, f.ram);
  replace(SSDS, f.ssds);
  replace(PSUS, f.psus);
  replace(COOLERS, f.coolers);
  replace(FAN_KITS, f.fans);
  replace(CASES, f.cases);
}

let activeVersion = CATALOG_VERSION;
export const catalogVersion = () => activeVersion;

/**
 * À appeler au démarrage, avant le chargement des prix.
 * Applique le catalogue en cache s'il est plus récent, puis tente d'en télécharger un nouveau.
 */
export async function loadCatalog(): Promise<number> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const cached = raw ? JSON.parse(raw) : undefined;
    if (isValid(cached) && cached.version > activeVersion) {
      apply(cached);
      activeVersion = cached.version;
    }
  } catch {
    /* cache illisible : on garde le catalogue intégré */
  }
  if (!CATALOG_URL) return activeVersion;
  try {
    const res = await fetch(CATALOG_URL, { cache: "no-cache" });
    if (!res.ok) throw new Error(String(res.status));
    const remote = await res.json();
    if (isValid(remote) && remote.version > activeVersion) {
      apply(remote);
      activeVersion = remote.version;
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(remote));
      } catch {
        /* cache indisponible */
      }
    }
  } catch {
    /* hors ligne : catalogue intégré ou en cache */
  }
  return activeVersion;
}
