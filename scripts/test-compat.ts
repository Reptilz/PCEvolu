// Cas pièges de compatibilité : sortie vidéo, plans vérifiés comme configs complètes, migration des disques.
// Utilisation : npx tsx scripts/test-compat.ts

import { readFileSync } from "node:fs";
import type { Report } from "../src/types";
import type { Check } from "../src/upgrade/types";
import { demoReport } from "../src/demo";
import { buildProfile, DEFAULT_ANSWERS } from "../src/upgrade/profile";
import { proposeAll } from "../src/upgrade/engine";
import { type Goal } from "../src/upgrade/goal";
import { optimize, planTitle, type Plan } from "../src/upgrade/optimizer";
import { BOARDS, CASES, COOLERS, CPUS, FAN_KITS, GPUS, PSUS, RAM_KITS, SSDS } from "../src/upgrade/catalog";

const prices = JSON.parse(readFileSync(new URL("../data/prices.json", import.meta.url), "utf8")).items as Record<string, { price: number }>;
for (const p of [...GPUS, ...CPUS, ...BOARDS, ...RAM_KITS, ...SSDS, ...PSUS, ...COOLERS, ...FAN_KITS, ...CASES]) {
  if (prices[p.id]) (p as { price?: number }).price = prices[p.id].price;
}

let failures = 0;
const assert = (label: string, ok: boolean) => {
  console.log(`  ${ok ? "✓" : "✗"} ${label}`);
  if (!ok) failures++;
};
const icon = (c: Check) => ({ ok: "✓", warn: "!", fixed: "↻", fail: "✗" })[c.status];
const showPlan = (title: string, pl?: Plan) => {
  if (!pl) return console.log(`  ${title} : aucun`);
  console.log(`  ${title} : ${planTitle(pl)} · ${pl.cost} €${pl.evaluation.fps != null ? ` · ≈ ${pl.evaluation.fps} i/s` : ""}`);
  for (const c of pl.checks ?? []) console.log(`      ${icon(c)} ${c.label.padEnd(28)} ${c.detail.slice(0, 110)}`);
};

const GB = 1024 ** 3;

// 1. PC sans carte graphique (graphiques intégrés) → un processeur F/KF doit entraîner une carte graphique.
const office: Report = {
  ...demoReport,
  system: { manufacturer: "Micro-Star International Co., Ltd.", model: "", isLaptop: false },
  cpus: [{ name: "Intel(R) Core(TM) i5-8400 CPU @ 2.80GHz" }],
  gpus: [{ name: "Intel(R) UHD Graphics 630" }],
  memory: { totalBytes: 16 * GB, slotsTotal: 4, modules: [{ capacityBytes: 8 * GB, kind: "DDR4", speedMts: 2666 }, { capacityBytes: 8 * GB, kind: "DDR4", speedMts: 2666 }] },
  board: { product: "B360M PRO-VDH (MS-7B24)" },
};
{
  console.log("\n■ PC sans carte graphique (i5-8400 + UHD 630)");
  const p = buildProfile(office, DEFAULT_ANSWERS);
  const all = proposeAll(p);
  const fCpu = all.cpu.find((x) => x.main.kind === "cpu" && !x.main.igpu);
  const withIgpu = all.cpu.find((x) => x.main.kind === "cpu" && x.main.igpu);
  assert(`un processeur sans iGPU (${fCpu?.title}) ajoute une carte graphique obligatoire`, !!fCpu?.additions.some((a) => a.role === "required" && a.part.kind === "gpu"));
  assert(`… avec le contrôle « Sortie vidéo » en échec`, !!fCpu?.checks.some((c) => c.label === "Sortie vidéo" && c.status === "fail"));
  assert(`un processeur avec iGPU (${withIgpu?.title ?? "aucun"}) n'ajoute pas de carte graphique`, !withIgpu || !withIgpu.additions.some((a) => a.part.kind === "gpu"));
  const goal: Goal = { usage: "office", resolution: "1080p", fps: 60, budget: 600, configured: true };
  const res = optimize(goal, p, office, all);
  for (const t of res.tiers) assert(`palier « ${planTitle(t)} » : sortie vidéo assurée`, !(t.checks ?? []).some((c) => c.label === "Sortie vidéo" && c.status === "fail"));
}

// 2. Ta config : plan vérifié comme une config complète.
{
  console.log("\n■ Ta config — Jeu 2K 100 i/s, budget 1 500 €");
  const p = buildProfile(demoReport, DEFAULT_ANSWERS);
  const goal: Goal = { usage: "gaming", resolution: "1440p", fps: 100, budget: 1500, configured: true };
  const res = optimize(goal, p, demoReport, proposeAll(p));
  showPlan("Meilleur plan", res.best);
  // Un palier qui change de plateforme (le processeur apporte une nouvelle carte mère).
  const big = [...res.tiers, ...res.alternatives].find((t) => t.choice.cpu?.additions.some((a) => a.part.kind === "board"));
  showPlan("Palier avec nouvelle plateforme", big);
  assert("le meilleur plan a une liste de compatibilité d'ensemble", (res.best?.checks?.length ?? 0) >= 6);
  assert("aucun contrôle en échec non résolu", !(res.best?.checks ?? []).some((c) => c.status === "fail"));
  if (big) {
    const pcie = big.checks?.find((c) => c.label === "Port PCIe");
    assert(`le port PCIe est évalué sur la NOUVELLE carte mère (${pcie?.detail.slice(0, 60)}…)`, !!pcie && /nouvelle carte mère/.test(pcie.detail));
    assert("la migration des disques est vérifiée", !!big.checks?.some((c) => c.label === "Stockage (migration)"));
  }
}

// 3. Trois SSD NVMe et une nouvelle plateforme micro-ATX (2 emplacements M.2) → alerte de migration.
{
  console.log("\n■ 3 SSD NVMe + changement de plateforme");
  const r: Report = {
    ...demoReport,
    disks: [1, 2, 3].map((i) => ({ name: `NVMe ${i}`, media: "SSD" as const, bus: "NVMe", sizeBytes: 1e12, health: "healthy" as const })),
  };
  const p = buildProfile(r, DEFAULT_ANSWERS);
  const all = proposeAll(p);
  const platform = all.cpu.find((x) => x.additions.some((a) => a.part.kind === "board"));
  const mig = platform?.checks.find((c) => c.label === "Stockage (migration)");
  console.log(`  ${platform?.title} → ${mig?.detail}`);
  assert("alerte quand les SSD NVMe dépassent les emplacements M.2 de la nouvelle carte", mig?.status === "warn");
}

// 4. Petit boîtier : hauteur du ventirad et épaisseur de carte graphique signalées.
{
  console.log("\n■ Petit boîtier");
  const p = buildProfile(demoReport, { ...DEFAULT_ANSWERS, caseSize: "small", cooler: "stock" });
  const all = proposeAll(p);
  const withCooler = all.cpu.find((x) => x.additions.some((a) => a.part.kind === "cooler"));
  assert(`ventirad ajouté → hauteur à vérifier (${withCooler?.title})`, !!withCooler?.checks.some((c) => c.label === "Hauteur du ventirad" && c.status === "warn"));
  const bigGpu = all.gpu.find((x) => x.main.kind === "gpu" && x.main.tbp >= 220);
  assert(`grosse carte graphique → épaisseur à vérifier (${bigGpu?.title})`, !!bigGpu?.checks.some((c) => c.label === "Épaisseur" && c.status === "warn"));
}

console.log(failures === 0 ? "\n✓ Tous les cas pièges sont gérés." : `\n✗ ${failures} cas en échec.`);
process.exit(failures === 0 ? 0 : 1);
