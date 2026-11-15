// Prix du marché : relevés toutes les 3 semaines par scripts/update-prices.ts et publiés dans data/prices.json.
//
// Ordre de priorité dans l'app :
//   1. le fichier téléchargé au démarrage (PRICES_URL) ;
//   2. la dernière version téléchargée, gardée en cache ;
//   3. la copie de data/prices.json incluse dans l'app au moment de sa compilation ;
//   4. les prix saisis dans le catalogue.

import bundled from "../../data/prices.json";
import bundledHistory from "../../data/price-history.json";
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
  /** Meilleures offres : les 3 moins chères + les 2 moins chères chez de grandes enseignes. */
  best?: { merchant: string; price: number; title?: string; link?: string }[];
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
/** Données publiées par le relevé (toutes les 3 semaines) dans le dépôt public. */
export const DATA_BASE_URL = "https://raw.githubusercontent.com/Reptilz/PCEvolu/main/data";
export const PRICES_URL: string | null = import.meta.env?.VITE_PRICES_URL ?? `${DATA_BASE_URL}/prices.json`;

const CACHE_KEY = "pcevolu.prices.v1";
/** Tous les composants du catalogue, relus à chaque fois (le catalogue peut avoir été remplacé par un plus récent). */
const all = () => [...GPUS, ...CPUS, ...BOARDS, ...RAM_KITS, ...SSDS, ...PSUS, ...COOLERS, ...FAN_KITS, ...CASES];
/** Prix du catalogue, conservés pour pouvoir y revenir. */
const BASE = new Map<string, number | undefined>();

let current: PricesFile | undefined;

/** Remplace les prix du catalogue par ceux du relevé (sans toucher aux composants absents du relevé). */
/**
 * Dernier garde-fou, côté app : une offre très loin de la médiane (moins de 50 % ou plus du double) est
 * presque toujours une erreur d'annonce. On ne l'affiche jamais comme « meilleur prix », même si un ancien
 * fichier de prix (cache, version embarquée) en contient encore.
 */
function sanitize(file: PricesFile): PricesFile {
  const items: Record<string, PriceEntry> = {};
  for (const [id, e] of Object.entries(file.items)) {
    const best = (e.best ?? []).filter((o) => o.price >= e.price * 0.5 && o.price <= e.price * 2 && !!o.title);
    const min = best.length ? Math.min(e.min >= e.price * 0.5 ? e.min : Infinity, ...best.map((o) => o.price)) : e.min >= e.price * 0.5 ? e.min : e.price;
    items[id] = { ...e, best, min: Math.round(min) };
  }
  return { ...file, items };
}

function apply(raw: PricesFile) {
  const file = sanitize(raw);
  current = file;
  for (const p of all()) {
    if (!BASE.has(p.id)) BASE.set(p.id, p.price);
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

// ---------------------------------------------------------------------------
// Historique des prix (un point par relevé)
// ---------------------------------------------------------------------------

/** [date AAAA-MM-JJ, médiane, meilleur prix] */
export type HistoryPoint = [string, number, number];

let history: Record<string, HistoryPoint[]> = ((bundledHistory as unknown as { items?: Record<string, HistoryPoint[]> }).items) ?? {};

export const historyOf = (id: string): HistoryPoint[] => history[id] ?? [];

/** Télécharge l'historique publié (sinon, celui inclus dans l'app). */
export async function loadHistory(): Promise<void> {
  try {
    const res = await fetch(`${DATA_BASE_URL}/price-history.json`, { cache: "no-cache" });
    if (!res.ok) return;
    const j = await res.json();
    if (j && typeof j.items === "object") history = j.items;
  } catch {
    /* hors ligne : historique intégré */
  }
}

export interface Trend {
  /** Évolution de la médiane depuis le relevé précédent, en %. */
  change?: number;
  /** Meilleur prix le plus bas jamais relevé. */
  lowest?: number;
  lowestDate?: string;
  points: number;
}

export function trendOf(id: string): Trend {
  const h = historyOf(id);
  if (h.length === 0) return { points: 0 };
  const last = h[h.length - 1];
  const prev = h.length >= 2 ? h[h.length - 2] : undefined;
  const low = h.reduce((a, p) => (p[2] < a[2] ? p : a), h[0]);
  return {
    change: prev ? Math.round(((last[1] - prev[1]) / prev[1]) * 1000) / 10 : undefined,
    lowest: low[2],
    lowestDate: low[0],
    points: h.length,
  };
}
