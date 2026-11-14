// Prix du marché : relevés chaque jour par scripts/update-prices.ts et publiés dans data/prices.json.
//
// Ordre de priorité dans l'app :
//   1. le fichier téléchargé au démarrage (PRICES_URL) ;
//   2. la dernière version téléchargée, gardée en cache ;
//   3. la copie de data/prices.json incluse dans l'app au moment de sa compilation ;
//   4. les prix saisis dans le catalogue.

import bundled from "../../data/prices.json";
import { BOARDS, CASES, COOLERS, CPUS, FAN_KITS, GPUS, PSUS, RAM_KITS, SSDS } from "./catalog";

export interface PriceEntry {
  /** Médiane des marchands (€). */
  price: number;
  min: number;
  max: number;
  offers: number;
  updatedAt: string;
  /** true si le dernier relevé a échoué et que ce prix est celui d'un relevé précédent. */
  stale?: boolean;
  best?: { merchant: string; price: number; link?: string }[];
}

export interface PricesFile {
  version: 1;
  updatedAt: string;
  currency: "EUR";
  source: string;
  items: Record<string, PriceEntry>;
}

/**
 * Adresse publique du fichier de prix.
 * À renseigner une fois le dépôt GitHub créé, par exemple :
 * https://raw.githubusercontent.com/<compte>/<depot>/main/data/prices.json
 */
export const PRICES_URL: string | null = import.meta.env.VITE_PRICES_URL ?? null;

const CACHE_KEY = "pcevolu.prices.v1";
const ALL = [...GPUS, ...CPUS, ...BOARDS, ...RAM_KITS, ...SSDS, ...PSUS, ...COOLERS, ...FAN_KITS, ...CASES];
/** Prix du catalogue, conservés pour pouvoir y revenir. */
const BASE = new Map(ALL.map((p) => [p.id, p.price]));

let current: PricesFile | undefined;

/** Remplace les prix du catalogue par ceux du relevé (sans toucher aux composants absents du relevé). */
function apply(file: PricesFile) {
  current = file;
  for (const p of ALL) {
    const live = file.items[p.id];
    (p as { price?: number }).price = live ? live.price : BASE.get(p.id);
  }
}

export const priceInfo = (id: string): PriceEntry | undefined => current?.items[id];
export const pricesFile = () => current;

function newer(a?: PricesFile, b?: PricesFile) {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a.updatedAt) >= Date.parse(b.updatedAt) ? a : b;
}

function readCache(): PricesFile | undefined {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as PricesFile) : undefined;
  } catch {
    return undefined;
  }
}

function isValid(f: unknown): f is PricesFile {
  return !!f && typeof f === "object" && (f as PricesFile).version === 1 && typeof (f as PricesFile).items === "object";
}

/** À appeler au démarrage : applique tout de suite le meilleur prix local, puis tente un téléchargement. */
export async function loadPrices(): Promise<PricesFile | undefined> {
  const local = newer(readCache(), isValid(bundled) && Object.keys(bundled.items).length ? (bundled as PricesFile) : undefined);
  if (local) apply(local);
  if (!PRICES_URL) return local;
  try {
    const res = await fetch(PRICES_URL, { cache: "no-cache" });
    if (!res.ok) throw new Error(String(res.status));
    const remote = await res.json();
    if (!isValid(remote)) throw new Error("format inattendu");
    const best = newer(remote, local)!;
    apply(best);
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(best));
    } catch {
      /* cache indisponible */
    }
    return best;
  } catch {
    return local; // hors ligne ou serveur indisponible : on garde les prix locaux
  }
}
