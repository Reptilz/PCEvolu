// Historique des prix : un point par composant et par relevé, sur deux ans glissants.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PriceEntry } from "../src/upgrade/prices";

export const HISTORY = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "price-history.json");
const HISTORY_MAX = 104; // ≈ 2 ans de relevés hebdomadaires

/** [date AAAA-MM-JJ, médiane, meilleur prix] */
export type HistoryPoint = [string, number, number];
export interface HistoryFile {
  version: 1;
  items: Record<string, HistoryPoint[]>;
}

export function recordHistory(items: Record<string, PriceEntry>, known: Set<string>, path = HISTORY) {
  const h: HistoryFile = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : { version: 1, items: {} };
  for (const [id, e] of Object.entries(items)) {
    if (e.stale) continue;
    const day = e.updatedAt.slice(0, 10);
    const arr = (h.items[id] ??= []);
    const point: HistoryPoint = [day, e.price, e.min];
    // Un seul point par jour : un relevé relancé le même jour remplace le précédent.
    if (arr.length && arr[arr.length - 1][0] === day) arr[arr.length - 1] = point;
    else if (!arr.length || arr[arr.length - 1][0] < day) arr.push(point);
    if (arr.length > HISTORY_MAX) arr.splice(0, arr.length - HISTORY_MAX);
  }
  for (const id of Object.keys(h.items)) if (!known.has(id)) delete h.items[id];
  writeFileSync(path, JSON.stringify(h) + "\n", "utf8");
}
