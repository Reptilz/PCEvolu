// Relevé hebdomadaire des prix (Google Shopping France via Serper.dev).
//
// Pour chaque composant proposé à l'achat dans le catalogue :
//   1. une recherche Google Shopping (France) ;
//   2. on ne garde que les offres dont le titre correspond vraiment au composant ;
//   3. une seule offre par marchand (la moins chère) ;
//   4. on écarte les prix aberrants, puis on prend la médiane.
// Le résultat est écrit dans data/prices.json, que l'app télécharge.
//
// Utilisation :
//   SERPER_API_KEY=xxx npm run prices                 relevé complet
//   npm run prices -- --only rtx-5070,rm750e          quelques composants
//   npm run prices -- --fixtures scripts/fixtures     test hors ligne, sans clé ni crédit

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BOARDS, CASES, COOLERS, CPUS, FAN_KITS, GPUS, PSUS, RAM_KITS, SSDS } from "../src/upgrade/catalog";
import type { PricesFile, PriceEntry } from "../src/upgrade/prices";
import { CATEGORY_EXCLUDE, GLOBAL_EXCLUDE, MERCHANT_EXCLUDE, QUERIES } from "./price-queries";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// En local, la clé peut être rangée dans le fichier .env (jamais publié) plutôt que dans le terminal.
const envFile = join(ROOT, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && m[2] && process.env[m[1]] == null) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const OUT = join(ROOT, "data", "prices.json");
const MIN_OFFERS = 3;

// ---------------------------------------------------------------------------
// Composants à relever
// ---------------------------------------------------------------------------

interface Target {
  id: string;
  category: string;
  name: string;
  /** Prix de référence du catalogue, pour écarter les résultats absurdes. */
  ref: number;
}

function targets(): Target[] {
  const list: Target[] = [];
  const add = (category: string, parts: { id: string; name: string; price?: number; availability?: unknown }[]) => {
    for (const p of parts) {
      // Les composants d'occasion (availability "used") ne sont pas relevés sur Google Shopping.
      if (p.price == null || ("availability" in p && p.availability !== "new")) continue;
      list.push({ id: p.id, category, name: p.name, ref: p.price });
    }
  };
  add("gpu", GPUS);
  add("cpu", CPUS);
  add("board", BOARDS);
  add("ram", RAM_KITS.map((k) => ({ ...k, availability: "new" })));
  add("ssd", SSDS.map((k) => ({ ...k, availability: "new" })));
  add("psu", PSUS.map((k) => ({ ...k, availability: "new" })));
  add("cooler", COOLERS.map((k) => ({ ...k, availability: "new" })));
  add("fans", FAN_KITS.map((k) => ({ ...k, availability: "new" })));
  add("case", CASES.map((k) => ({ ...k, availability: "new" })));
  return list;
}

// ---------------------------------------------------------------------------
// Recherche
// ---------------------------------------------------------------------------

interface ShoppingItem {
  title?: string;
  source?: string;
  link?: string;
  price?: string;
}

async function search(q: string, id: string, fixtures?: string, dump?: string): Promise<ShoppingItem[]> {
  if (fixtures) {
    const f = join(fixtures, `${id}.json`);
    return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")).shopping ?? []) : [];
  }
  const key = process.env.SERPER_API_KEY;
  if (!key) throw new Error("SERPER_API_KEY manquante (variable d'environnement).");
  const res = await fetch("https://google.serper.dev/shopping", {
    method: "POST",
    headers: { "X-API-KEY": key, "Content-Type": "application/json" },
    body: JSON.stringify({ q, gl: "fr", hl: "fr", num: 40 }),
  });
  if (!res.ok) throw new Error(`Serper ${res.status} : ${await res.text()}`);
  const json = (await res.json()) as { shopping?: ShoppingItem[] };
  if (dump) {
    // Réponses brutes, réutilisables ensuite comme fixtures de test.
    mkdirSync(dump, { recursive: true });
    writeFileSync(join(dump, `${id}.json`), JSON.stringify(json, null, 2), "utf8");
  }
  return json.shopping ?? [];
}

// ---------------------------------------------------------------------------
// Filtrage et calcul
// ---------------------------------------------------------------------------

export const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[  ]/g, " ")
    .replace(/[×✕]/g, "x")
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ");

/** "1 099,99 €", "€1,099.99", "559,99 €" → nombre. */
export function parsePrice(raw?: string): number | undefined {
  if (!raw) return undefined;
  let s = raw.replace(/[^\d.,]/g, "");
  if (!s) return undefined;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) {
    // format français : séparateur décimal = virgule
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const quantile = (sorted: number[], q: number) => {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

export interface Offer {
  merchant: string;
  price: number;
  title: string;
  link?: string;
}

/** Raison du rejet d'une offre, ou null si elle est retenue. */
function rejectReason(t: Target, title: string, merchant: string, price: number | undefined): string | null {
  const query = QUERIES[t.id];
  const catEx = CATEGORY_EXCLUDE[t.category];
  if (price == null) return "prix illisible";
  const missing = query.must.find((r) => !r.test(title));
  if (missing) return `manque ${missing}`;
  const excluded = (query.not ?? []).find((r) => r.test(title));
  if (excluded) return `variante ${excluded}`;
  if (GLOBAL_EXCLUDE.test(title)) return "occasion / lot";
  if (MERCHANT_EXCLUDE.test(merchant)) return "vendeur d'occasion";
  if (catEx?.test(title)) return "hors catégorie";
  // Garde-fou bas : écarte les accessoires (stickers, câbles…) qui reprennent le nom du produit.
  // Pas de limite haute : les prix peuvent tripler en pénurie (RAM 2026) ; les PC complets sont
  // déjà exclus par le titre, et les prix aberrants par la méthode de Tukey.
  if (price < t.ref * 0.35) return `prix trop bas (réf. ${t.ref} €)`;
  return null;
}

export function selectOffers(t: Target, items: ShoppingItem[], explain = false): { kept: Offer[]; rejected: number } {
  const byMerchant = new Map<string, Offer>();
  let rejected = 0;

  for (const it of items) {
    const title = normalize(it.title ?? "");
    const merchantName = normalize(it.source ?? "");
    const price = parsePrice(it.price);
    const reason = rejectReason(t, title, merchantName, price);
    if (explain) console.log(`   ${reason ? "✗" : "✓"} ${String(price ?? "?").padStart(8)} € | ${(it.source ?? "?").slice(0, 18).padEnd(18)} | ${(it.title ?? "").slice(0, 80)}${reason ? `  ← ${reason}` : ""}`);
    if (reason) {
      rejected++;
      continue;
    }
    const merchant = (it.source ?? "?").trim();
    // Une offre par marchand ; pour une requête générique, une par marchand ET par produit.
    const key = merchant.toLowerCase() + (QUERIES[t.id].generic ? `|${title}` : "");
    const prev = byMerchant.get(key);
    if (!prev || price! < prev.price) byMerchant.set(key, { merchant, price: price!, title: it.title ?? "", link: it.link });
  }

  let kept = [...byMerchant.values()];
  // Valeurs aberrantes (méthode de Tukey) quand on a assez d'offres.
  if (kept.length >= 5) {
    const s = kept.map((o) => o.price).sort((a, b) => a - b);
    const q1 = quantile(s, 0.25);
    const q3 = quantile(s, 0.75);
    const iqr = q3 - q1;
    const before = kept.length;
    kept = kept.filter((o) => o.price >= q1 - 1.5 * iqr && o.price <= q3 + 1.5 * iqr);
    rejected += before - kept.length;
  }
  return { kept: kept.sort((a, b) => a.price - b.price), rejected };
}

// ---------------------------------------------------------------------------
// Programme principal
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const arg = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const fixtures = arg("--fixtures");
  const only = arg("--only")?.split(",");
  const out = arg("--out") ?? OUT;
  const dump = arg("--dump");
  const explain = args.includes("--explain");

  const previous: PricesFile | undefined = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : undefined;
  const now = new Date().toISOString();
  const items: Record<string, PriceEntry> = { ...(previous?.items ?? {}) };

  const list = targets().filter((t) => !only || only.includes(t.id));
  const missing = list.filter((t) => !QUERIES[t.id]);
  if (missing.length) console.warn(`⚠ Sans requête définie (ignorés) : ${missing.map((t) => t.id).join(", ")}`);

  let updated = 0;
  let failed = 0;
  for (const t of list.filter((x) => QUERIES[x.id])) {
    // Référence du garde-fou : le dernier prix du marché connu, plus fiable que le catalogue.
    const prev = items[t.id];
    if (prev && !prev.stale) t.ref = prev.price;
    try {
      const results = await search(QUERIES[t.id].q, t.id, fixtures, dump);
      if (explain) console.log(`\n${t.id} — « ${QUERIES[t.id].q} »`);
      const { kept, rejected } = selectOffers(t, results, explain);
      // Les cartes mères ont moins de vendeurs : 2 offres au titre exact suffisent.
      const minOffers = t.category === "board" ? 2 : MIN_OFFERS;
      if (kept.length < minOffers) {
        // Pas assez d'offres fiables : on garde le dernier prix connu, marqué comme ancien.
        if (items[t.id]) items[t.id] = { ...items[t.id], stale: true };
        console.log(`· ${t.id.padEnd(18)} ${kept.length} offre(s) fiable(s) sur ${results.length} : prix précédent conservé`);
        failed++;
        continue;
      }
      const med = Math.round(median(kept.map((o) => o.price)));
      items[t.id] = {
        price: med,
        min: Math.round(kept[0].price),
        max: Math.round(kept[kept.length - 1].price),
        offers: kept.length,
        updatedAt: now,
        best: kept.slice(0, 3).map((o) => ({ merchant: o.merchant, price: Math.round(o.price * 100) / 100, link: o.link })),
      };
      updated++;
      const drift = Math.abs(med / t.ref - 1);
      console.log(
        `✓ ${t.id.padEnd(18)} ${String(med).padStart(5)} €  (médiane de ${kept.length} offres, ${rejected} écartées, réf. ${t.ref} €)` +
          (drift > 0.5 ? `  ⚠ écart de ${Math.round(drift * 100)} % avec la référence` : ""),
      );
    } catch (e) {
      failed++;
      if (items[t.id]) items[t.id] = { ...items[t.id], stale: true };
      console.error(`✗ ${t.id} : ${(e as Error).message}`);
    }
    if (!fixtures) await new Promise((r) => setTimeout(r, 250)); // on reste poli avec l'API
  }

  const file: PricesFile = {
    version: 1,
    updatedAt: updated > 0 ? now : previous?.updatedAt ?? now,
    currency: "EUR",
    source: "Google Shopping France (via Serper.dev), médiane des marchands",
    items,
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(file, null, 2) + "\n", "utf8");
  console.log(`\n${updated} prix mis à jour, ${failed} non mis à jour → ${out}`);
  // Échec seulement si rien n'a pu être relevé (clé invalide, quota épuisé…).
  if (updated === 0 && list.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
