// Test du diagnostic « Mon objectif » et de l'effet des propositions.
// Utilisation : npx tsx scripts/test-goal.ts

import { readFileSync } from "node:fs";
import type { Report } from "../src/types";
import { demoReport } from "../src/demo";
import { buildProfile, DEFAULT_ANSWERS } from "../src/upgrade/profile";
import { proposeAll } from "../src/upgrade/engine";
import { assess, goalSummary, impactOf, type Goal } from "../src/upgrade/goal";
import { BOARDS, CASES, COOLERS, CPUS, FAN_KITS, GPUS, PSUS, RAM_KITS, SSDS } from "../src/upgrade/catalog";

// Prix du marché du dernier relevé, comme dans l'app.
const prices = JSON.parse(readFileSync(new URL("../data/prices.json", import.meta.url), "utf8")).items as Record<string, { price: number }>;
for (const p of [...GPUS, ...CPUS, ...BOARDS, ...RAM_KITS, ...SSDS, ...PSUS, ...COOLERS, ...FAN_KITS, ...CASES]) {
  if (prices[p.id]) (p as { price?: number }).price = prices[p.id].price;
}

const GB = 1024 ** 3;
const office: Report = {
  ...demoReport,
  system: { manufacturer: "Dell Inc.", model: "OptiPlex 9020", isLaptop: false },
  cpus: [{ name: "Intel(R) Core(TM) i5-4460  CPU @ 3.20GHz" }],
  gpus: [{ name: "Intel(R) HD Graphics 4600" }],
  memory: { totalBytes: 8 * GB, slotsTotal: 4, modules: [{ capacityBytes: 4 * GB, kind: "DDR3" }, { capacityBytes: 4 * GB, kind: "DDR3" }] },
  board: { product: "0V62H2" },
  disks: [{ name: "WDC", media: "HDD", bus: "SATA", sizeBytes: 500e9, health: "healthy" }],
};

const CASES_: [string, Report, Goal][] = [
  ["Ta config", demoReport, { usage: "gaming", resolution: "1440p", fps: 60, budget: 800, configured: true }],
  ["Ta config", demoReport, { usage: "gaming", resolution: "1440p", fps: 100, budget: 800, configured: true }],
  ["Ta config", demoReport, { usage: "gaming", resolution: "4k", fps: 60, budget: 2000, configured: true }],
  ["Ta config", demoReport, { usage: "office", resolution: "1080p", fps: 60, budget: 300, configured: true }],
  ["Ta config", demoReport, { usage: "creation", resolution: "1080p", fps: 60, budget: 1000, configured: true }],
  ["Dell 2014", office, { usage: "office", resolution: "1080p", fps: 60, budget: 200, configured: true }],
];

for (const [label, report, goal] of CASES_) {
  const p = buildProfile(report, DEFAULT_ANSWERS);
  const v = assess(goal, p, report);
  console.log(`\n■ ${label} — ${goalSummary(goal)}`);
  console.log(`  ${v.level.toUpperCase()} : ${v.title}. ${v.summary}`);
  for (const n of v.needs) console.log(`    ${n.status === "ok" ? "✓" : n.status === "limited" ? "!" : "✗"} ${n.label.padEnd(24)} ${n.current}  (objectif : ${n.target})`);
  const all = proposeAll(p);
  for (const cat of ["gpu", "cpu", "ram", "storage"] as const) {
    const best = all[cat]
      .map((x) => ({ x, i: impactOf(goal, p, v, x.main as never, cat) }))
      .filter((s) => s.i.relevant && (goal.budget == null || s.x.total <= goal.budget))
      .sort((a, b) => Number(b.i.reachesGoal) - Number(a.i.reachesGoal) || a.x.total - b.x.total)[0];
    if (best) console.log(`    → ${cat.padEnd(7)} ${best.x.title} · ${best.x.total} €${best.i.reachesGoal ? " · ✓ objectif" : ""}${best.i.label ? ` · ${best.i.label}` : ""}`);
  }
}
