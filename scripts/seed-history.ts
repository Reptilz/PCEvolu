// Crée (ou complète) data/price-history.json à partir du dernier relevé (data/prices.json).
// Utile une seule fois pour démarrer l'historique ; ensuite, chaque relevé ajoute son point.
// Utilisation : npx tsx scripts/seed-history.ts

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PricesFile } from "../src/upgrade/prices";
import { recordHistory } from "./history";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const prices: PricesFile = JSON.parse(readFileSync(join(ROOT, "data", "prices.json"), "utf8"));
recordHistory(prices.items, new Set(Object.keys(prices.items)));
console.log(`Historique initialisé avec ${Object.keys(prices.items).length} composants.`);
