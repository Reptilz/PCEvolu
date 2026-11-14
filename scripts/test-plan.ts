// Test de l'optimiseur : meilleur plan dans le budget et paliers.
// Utilisation : npx tsx scripts/test-plan.ts

import { readFileSync } from "node:fs";
import type { Report } from "../src/types";
import { demoReport } from "../src/demo";
import { buildProfile, DEFAULT_ANSWERS } from "../src/upgrade/profile";
import { proposeAll } from "../src/upgrade/engine";
import { goalSummary, type Goal } from "../src/upgrade/goal";
import { optimize, planTitle, type Plan } from "../src/upgrade/optimizer";
import { BOARDS, CASES, COOLERS, CPUS, FAN_KITS, GPUS, PSUS, RAM_KITS, SSDS } from "../src/upgrade/catalog";

const prices = JSON.parse(readFileSync(new URL("../data/prices.json", import.meta.url), "utf8")).items as Record<string, { price: number }>;
for (const p of [...GPUS, ...CPUS, ...BOARDS, ...RAM_KITS, ...SSDS, ...PSUS, ...COOLERS, ...FAN_KITS, ...CASES]) {
  if (prices[p.id]) (p as { price?: number }).price = prices[p.id].price;
}

const GB = 1024 ** 3;
const dell: Report = {
  ...demoReport,
  system: { manufacturer: "Dell Inc.", model: "OptiPlex 9020", isLaptop: false },
  cpus: [{ name: "Intel(R) Core(TM) i5-4460  CPU @ 3.20GHz" }],
  gpus: [{ name: "Intel(R) HD Graphics 4600" }],
  memory: { totalBytes: 8 * GB, slotsTotal: 4, modules: [{ capacityBytes: 4 * GB, kind: "DDR3" }, { capacityBytes: 4 * GB, kind: "DDR3" }] },
  board: { product: "0V62H2" },
  disks: [{ name: "WDC", media: "HDD", bus: "SATA", sizeBytes: 500e9, health: "healthy" }],
};
const ryzen2600: Report = {
  ...demoReport,
  cpus: [{ name: "AMD Ryzen 5 2600 Six-Core Processor" }],
  gpus: [{ name: "NVIDIA GeForce GTX 1060 6GB" }],
  memory: { totalBytes: 16 * GB, slotsTotal: 4, modules: [{ capacityBytes: 8 * GB, kind: "DDR4", speedMts: 2933 }, { capacityBytes: 8 * GB, kind: "DDR4", speedMts: 2933 }] },
  board: { product: "B450 TOMAHAWK MAX (MS-7C02)" },
};

const line = (pl: Plan) =>
  `${String(pl.cost).padStart(5)} € · ${planTitle(pl)}${pl.evaluation.fps != null ? ` · ≈ ${pl.evaluation.fps} i/s` : ""} · score ${pl.evaluation.score}${pl.evaluation.reached ? " ✓" : ""}` +
  (pl.additions.filter((a) => a.role === "required").length ? `  [+ ${pl.additions.filter((a) => a.role === "required").map((a) => a.part.name.split(" (")[0]).join(", ")}]` : "");

const CASES_: [string, Report, Goal][] = [
  ["Ta config", demoReport, { usage: "gaming", resolution: "1440p", fps: 100, budget: 800, configured: true }],
  ["Ta config", demoReport, { usage: "gaming", resolution: "1440p", fps: 100, budget: 1500, configured: true }],
  ["Ta config", demoReport, { usage: "gaming", resolution: "4k", fps: 60, budget: null, configured: true }],
  ["Ta config", demoReport, { usage: "creation", resolution: "1080p", fps: 60, budget: 600, configured: true }],
  ["Ta config", demoReport, { usage: "office", resolution: "1080p", fps: 60, budget: 300, configured: true }],
  ["Dell 2014", dell, { usage: "office", resolution: "1080p", fps: 60, budget: 300, configured: true }],
  ["Ryzen 5 2600 + GTX 1060", ryzen2600, { usage: "gaming", resolution: "1080p", fps: 100, budget: 700, configured: true }],
];

for (const [label, report, goal] of CASES_) {
  const p = buildProfile(report, DEFAULT_ANSWERS);
  const t0 = performance.now();
  const res = optimize(goal, p, report, proposeAll(p));
  const ms = Math.round(performance.now() - t0);
  console.log(`\n■ ${label} — ${goalSummary(goal)}   (${ms} ms)`);
  console.log(`  aujourd'hui : score ${res.current.score}${res.current.fps != null ? `, ≈ ${res.current.fps} i/s` : ""}${res.current.reached ? " ✓ objectif atteint" : ""}`);
  console.log(`  meilleur plan dans le budget : ${res.best ? line(res.best) : "aucun"}`);
  if (res.cheapestReach && res.cheapestReach !== res.best) console.log(`  objectif atteint dès : ${line(res.cheapestReach)}`);
  console.log(`  autres options dans le budget :`);
  for (const a of res.alternatives) console.log(`    ${line(a)}`);
  console.log(`  paliers :`);
  for (const t of res.tiers) console.log(`    ${line(t)}`);
}
