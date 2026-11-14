// Optimiseur : la meilleure combinaison d'upgrades pour un objectif et un budget.
//
// 1. Pour chaque catégorie, on prend les propositions du moteur (déjà vérifiées, avec leurs pièces obligatoires)
//    plus l'option « ne rien changer ».
// 2. On teste toutes les combinaisons (carte graphique × processeur/plateforme × RAM × stockage),
//    en dédoublonnant les pièces communes : une seule alimentation, dimensionnée pour le NOUVEAU couple
//    processeur + carte graphique ; pas de RAM en plus si la nouvelle plateforme en apporte déjà ; etc.
// 3. Chaque combinaison reçoit un score face à l'objectif (même logique que le diagnostic).
// 4. On garde la meilleure dans le budget, et la « frontière » coût / score pour afficher des paliers.

import type { Addition, Category, CpuSpec, GpuSpec, Part, Proposal } from "./types";
import type { Report } from "../types";
import type { Profile } from "./profile";
import { estimateFps, isGaming, type Goal } from "./goal";
import { checkPower, price } from "./engine";

// ---------------------------------------------------------------------------
// Évaluation d'une config (réelle ou hypothétique)
// ---------------------------------------------------------------------------

export interface ConfigState {
  cpu?: CpuSpec;
  gpu?: GpuSpec;
  ramGb: number;
  dual: boolean;
  ssd: boolean;
  nvme: boolean;
}

export interface Evaluation {
  /** 0 à 1 (un peu plus si l'objectif est dépassé). */
  score: number;
  reached: boolean;
  fps?: number;
  limit?: "gpu" | "cpu";
}

/** Score d'une config face à l'objectif : mêmes seuils que le diagnostic (goal.ts). */
export function evaluate(goal: Goal, s: ConfigState): Evaluation {
  const parts: [number, number][] = []; // [poids, valeur 0..1]
  const ssd = s.ssd ? 1 : 0;
  let reached = !!s.ssd;
  let fps: number | undefined;
  let limit: "gpu" | "cpu" | undefined;
  let bonus = 0;

  if (goal.usage === "office") {
    parts.push([2, ssd]);
    parts.push([1, s.ramGb >= 16 ? 1 : s.ramGb >= 8 ? 0.7 : 0.3]);
    parts.push([1, (s.cpu?.gaming ?? 0) >= 55 ? 1 : 0.5]);
    reached = reached && s.ramGb >= 16 && (s.cpu?.gaming ?? 0) >= 55;
  }

  if (isGaming(goal.usage)) {
    const est = estimateFps(s.cpu, s.gpu, goal.resolution, s.dual);
    fps = est?.fps ?? 0;
    limit = est?.limit;
    const ratio = fps / goal.fps;
    parts.push([6, Math.min(ratio, 1)]);
    parts.push([1, est && !est.vramShort ? 1 : 0]);
    parts.push([1, s.ramGb >= 16 && s.dual ? 1 : s.ramGb >= 16 ? 0.6 : 0.3]);
    parts.push([1, ssd]);
    // Au-delà de l'objectif, un peu de marge vaut quelque chose (jeux futurs), mais de moins en moins.
    bonus += Math.min(Math.max(ratio - 1, 0), 0.5) * 0.08;
    reached = reached && ratio >= 1 && !!est && !est.vramShort && s.ramGb >= 16 && s.dual;
    if (goal.usage === "streaming") {
      parts.push([1, (s.cpu?.multi ?? 0) >= 120 ? 1 : 0.5]);
      reached = reached && (s.cpu?.multi ?? 0) >= 120;
    }
  }

  if (goal.usage === "creation") {
    const multi = s.cpu?.multi ?? 0;
    const gpuOk = !!s.gpu && !s.gpu.integrated && s.gpu.vramGb >= 8 && s.gpu.perf >= 70;
    parts.push([4, Math.min(multi / 180, 1)]);
    parts.push([2, s.ramGb >= 32 ? 1 : s.ramGb >= 16 ? 0.6 : 0.2]);
    parts.push([1, gpuOk ? 1 : 0.3]);
    parts.push([1, s.nvme ? 1 : ssd * 0.7]);
    bonus += Math.min(Math.max(multi / 180 - 1, 0), 0.6) * 0.08;
    reached = reached && multi >= 180 && s.ramGb >= 32 && gpuOk && s.nvme;
  }

  const w = parts.reduce((a, [k]) => a + k, 0);
  const score = parts.reduce((a, [k, v]) => a + k * v, 0) / w + bonus;
  return { score: Math.round(score * 1000) / 1000, reached, fps, limit };
}

export function currentState(p: Profile, r: Report): ConfigState {
  return {
    cpu: p.cpu,
    gpu: p.gpu,
    ramGb: p.ramTotalGb,
    dual: p.ramModules >= 2,
    ssd: r.disks.some((d) => d.media === "SSD"),
    nvme: r.disks.some((d) => d.bus === "NVMe"),
  };
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export interface Plan {
  /** Une proposition par catégorie changée. */
  items: Proposal[];
  /** Pièces obligatoires, à vérifier ou conseillées, dédoublonnées sur l'ensemble du plan. */
  additions: Addition[];
  /** Composants principaux + pièces obligatoires. */
  cost: number;
  /** Idem + pièces « à vérifier ». */
  costIfVerify: number;
  evaluation: Evaluation;
}

/** Quantité de RAM après une proposition RAM (ajout ou remplacement). */
function ramGbAfter(p: Proposal, currentGb: number): number {
  if (p.main.kind !== "ram") return currentGb;
  const kit = p.main.sticks * p.main.gbPerStick;
  return p.id.startsWith("ram-add") ? currentGb + kit : kit;
}

/** Assemble un plan à partir d'un choix par catégorie. */
function buildPlan(goal: Goal, p: Profile, base: ConfigState, choice: Partial<Record<Category, Proposal>>): Plan {
  const items = (["gpu", "cpu", "ram", "storage"] as Category[]).map((c) => choice[c]).filter(Boolean) as Proposal[];
  const gpu = choice.gpu ? (choice.gpu.main as GpuSpec) : base.gpu;
  const cpu = choice.cpu ? (choice.cpu.main as CpuSpec) : base.cpu;
  const platformRam = choice.cpu?.additions.find((a) => a.part.kind === "ram");

  // État après le plan
  let ramGb = base.ramGb;
  let dual = base.dual;
  if (platformRam && platformRam.part.kind === "ram") {
    ramGb = platformRam.part.sticks * platformRam.part.gbPerStick;
    dual = platformRam.part.sticks >= 2;
  } else if (choice.ram) {
    ramGb = ramGbAfter(choice.ram, base.ramGb);
    dual = true;
  }
  const storage = choice.storage?.main;
  const state: ConfigState = {
    cpu, gpu, ramGb, dual,
    ssd: base.ssd || !!storage,
    nvme: base.nvme || (storage?.kind === "ssd" && storage.iface !== "SATA"),
  };

  // Pièces communes, dédoublonnées. L'alimentation est recalculée pour le couple final.
  const additions: Addition[] = [];
  const seen = new Map<string, Addition>();
  for (const it of items) {
    for (const a of it.additions) {
      if (a.part.kind === "psu") continue;
      const key = a.part.kind === "cooler" || a.part.kind === "case" || a.part.kind === "fans" ? a.part.kind : `${a.part.kind}:${a.part.id}`;
      const prev = seen.get(key);
      const rank = { required: 0, verify: 1, recommended: 2 };
      if (!prev) seen.set(key, a);
      else if (rank[a.role] < rank[prev.role] || (a.part.kind === "cooler" && prev.part.kind === "cooler" && a.part.capacityW > prev.part.capacityW)) seen.set(key, a);
    }
  }
  additions.push(...seen.values());
  if (choice.gpu || choice.cpu) {
    const psuAdds: Addition[] = [];
    checkPower(p, cpu?.powerW, gpu, [], psuAdds, "");
    additions.push(...psuAdds);
  }

  const mains = items.reduce((s, it) => s + price(it.main) * it.mainQuantity, 0);
  const sum = (roles: string[]) => additions.filter((a) => roles.includes(a.role)).reduce((s, a) => s + price(a.part) * a.quantity, 0);
  return {
    items,
    additions,
    cost: mains + sum(["required"]),
    costIfVerify: mains + sum(["required", "verify"]),
    evaluation: evaluate(goal, state),
  };
}

export interface OptimizeResult {
  current: Evaluation;
  /** Meilleur plan dans le budget (undefined si aucun ne fait mieux que la config actuelle). */
  best?: Plan;
  /** Plan le moins cher qui atteint l'objectif, quel que soit le budget. */
  cheapestReach?: Plan;
  /** Paliers : chaque plan fait nettement mieux que tous les plans moins chers. */
  tiers: Plan[];
}

export function optimize(goal: Goal, p: Profile, r: Report, all: Record<Category, Proposal[]>): OptimizeResult {
  const base = currentState(p, r);
  const current = evaluate(goal, base);
  const opt = <T,>(list: T[]) => [undefined, ...list];

  const plans: Plan[] = [];
  for (const gpu of opt(all.gpu)) {
    for (const cpu of opt(all.cpu)) {
      // Une nouvelle plateforme qui apporte sa propre RAM rend les options RAM inutiles.
      const cpuBringsRam = !!cpu?.additions.some((a) => a.part.kind === "ram");
      for (const ram of cpuBringsRam ? [undefined] : opt(all.ram)) {
        for (const storage of opt(all.storage)) {
          if (!gpu && !cpu && !ram && !storage) continue;
          const plan = buildPlan(goal, p, base, { gpu, cpu, ram, storage });
          // On ignore les plans qui n'améliorent rien pour cet objectif.
          if (plan.evaluation.score > current.score + 0.004) plans.push(plan);
        }
      }
    }
  }

  plans.sort((a, b) => a.cost - b.cost || b.evaluation.score - a.evaluation.score);

  // Frontière : en avançant dans les prix, on ne garde que les plans qui font nettement mieux.
  const frontier: Plan[] = [];
  let bestScore = current.score;
  for (const pl of plans) {
    if (pl.evaluation.score > bestScore + 0.015) {
      frontier.push(pl);
      bestScore = pl.evaluation.score;
    }
  }

  const cheapestReach = plans.find((pl) => pl.evaluation.reached);
  const affordable = plans.filter((pl) => goal.budget == null || pl.cost <= goal.budget);
  const reachInBudget = affordable.find((pl) => pl.evaluation.reached);
  // Dans le budget : le moins cher qui atteint l'objectif, sinon celui qui s'en approche le plus.
  const best = reachInBudget ?? [...affordable].sort((a, b) => b.evaluation.score - a.evaluation.score || a.cost - b.cost)[0];

  return { current, best, cheapestReach, tiers: pickTiers(frontier, cheapestReach) };
}

/** Garde au plus 5 paliers lisibles, dont toujours le premier pas et le premier plan qui atteint l'objectif. */
function pickTiers(frontier: Plan[], reach?: Plan): Plan[] {
  if (frontier.length <= 5) return frontier;
  const keep = new Set<Plan>([frontier[0], frontier[frontier.length - 1]]);
  if (reach) keep.add(frontier.find((f) => f.evaluation.reached) ?? reach);
  // Puis les plus gros sauts de score.
  const jumps = frontier.slice(1).map((f, i) => ({ f, jump: f.evaluation.score - frontier[i].evaluation.score })).sort((a, b) => b.jump - a.jump);
  for (const j of jumps) {
    if (keep.size >= 5) break;
    keep.add(j.f);
  }
  return frontier.filter((f) => keep.has(f));
}

/** Résumé lisible d'un plan : « RX 9070 + 2e barrette de RAM ». */
export function planTitle(pl: Plan): string {
  return pl.items.map((it) => shortName(it)).join(" + ");
}

function shortName(it: Proposal): string {
  const m: Part = it.main;
  if (m.kind === "gpu") return m.name.replace(/^GeForce |^Radeon /, "");
  if (m.kind === "cpu") return m.name.replace(/^Intel Core |^AMD /, "") + (it.additions.some((a) => a.part.kind === "board") ? " (nouvelle plateforme)" : "");
  if (m.kind === "ram") {
    const gb = m.sticks * m.gbPerStick;
    return it.id === "ram-add-same" ? "2e barrette de RAM (dual channel)" : it.id.startsWith("ram-add") ? `${gb} Go de RAM en plus` : `RAM ${gb} Go`;
  }
  if (m.kind === "ssd") return m.name.replace(/ \(ex\..*\)/, "");
  return it.title;
}
