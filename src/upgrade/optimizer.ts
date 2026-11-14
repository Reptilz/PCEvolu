// Optimiseur : la meilleure combinaison d'upgrades pour un objectif et un budget.
//
// 1. Pour chaque catégorie, on prend les propositions du moteur (déjà vérifiées, avec leurs pièces obligatoires)
//    plus l'option « ne rien changer ».
// 2. On teste toutes les combinaisons (carte graphique × processeur/plateforme × RAM × stockage),
//    en dédoublonnant les pièces communes : une seule alimentation, dimensionnée pour le NOUVEAU couple
//    processeur + carte graphique ; pas de RAM en plus si la nouvelle plateforme en apporte déjà ; etc.
// 3. Chaque combinaison reçoit un score face à l'objectif (même logique que le diagnostic).
// 4. On garde la meilleure dans le budget, et la « frontière » coût / score pour afficher des paliers.

import type { Addition, Category, Check, CpuSpec, GpuSpec, Part, Proposal } from "./types";
import type { Report } from "../types";
import type { Profile } from "./profile";
import { estimateFps, isGaming, type Goal } from "./goal";
import { checkPower, epsCable, gpuThickness, price, storageMigration } from "./engine";

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
    // Le dual channel compte déjà dans les i/s estimés : ici, il ne pèse que pour le confort (multitâche, jeux futurs).
    parts.push([0.5, s.ramGb >= 16 && s.dual ? 1 : s.ramGb >= 16 ? 0.7 : 0.3]);
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
  /** Choix par catégorie (pour revérifier le plan comme une config complète). */
  choice: Partial<Record<Category, Proposal>>;
  /** Compatibilité d'ensemble, calculée sur la config APRÈS le plan (voir validatePlan). */
  checks?: Check[];
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
  // Un processeur sans puce graphique peut avoir ajouté une carte graphique « pour avoir une image » :
  // elle compte comme la carte du plan, sauf si le plan en choisit déjà une.
  const cpuGpu = choice.cpu?.additions.find((a) => a.part.kind === "gpu")?.part as GpuSpec | undefined;
  const gpu = choice.gpu ? (choice.gpu.main as GpuSpec) : cpuGpu ?? base.gpu;
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
    ssd: base.ssd || (storage?.kind === "ssd" && storage.iface !== "HDD"),
    nvme: base.nvme || (storage?.kind === "ssd" && storage.iface.startsWith("NVMe")),
  };

  // Pièces communes, dédoublonnées. L'alimentation est recalculée pour le couple final.
  const additions: Addition[] = [];
  const seen = new Map<string, Addition>();
  for (const it of items) {
    for (const a of it.additions) {
      if (a.part.kind === "psu") continue;
      if (a.part.kind === "gpu" && choice.gpu) continue; // la carte choisie dans le plan fournit déjà l'image
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
    choice,
  };
}

// ---------------------------------------------------------------------------
// Vérification d'un plan comme une config complète
// ---------------------------------------------------------------------------

/** Contrôles propres à chaque pièce, qui ne dépendent pas des autres pièces du plan. */
const LOCAL_CHECKS = new Set([
  "Carte mère", "Mémoire vive", "Format", "BIOS", "Ventirad", "Hauteur du ventirad", "Encombrement du ventirad",
  "Place dans le boîtier", "Ventilation du boîtier", "Épaisseur", "PC de marque", "Type de mémoire", "Emplacement libre",
  "Emplacements libres", "Vitesse", "Barrettes assorties", "Capacité max", "4 barrettes", "Emplacement M.2", "Branchement", "PC portable",
]);
const RANK: Record<string, number> = { fail: 0, warn: 1, fixed: 2, ok: 3 };

/**
 * Revérifie le plan sur la config APRÈS achat : sortie vidéo, carte mère, RAM, port PCIe de la nouvelle carte mère,
 * alimentation et câbles pour le couple final, ventirad, boîtier, migration des disques, équilibre CPU / GPU.
 * Un contrôle « incompatible » réglé par une pièce du plan devient « réglé dans ce plan ».
 */
export function validatePlan(goal: Goal, p: Profile, plan: Plan): Check[] {
  const { choice } = plan;
  const cpu = (choice.cpu?.main as CpuSpec | undefined) ?? p.cpu;
  const cpuGpu = choice.cpu?.additions.find((a) => a.part.kind === "gpu")?.part as GpuSpec | undefined;
  const gpu = (choice.gpu?.main as GpuSpec | undefined) ?? cpuGpu ?? p.gpu;
  const newBoard = choice.cpu?.additions.find((a) => a.part.kind === "board")?.part;
  const out = new Map<string, Check>();
  const put = (c: Check) => {
    const prev = out.get(c.label);
    if (!prev || RANK[c.status] < RANK[prev.status]) out.set(c.label, c);
  };

  // 1. Contrôles locaux des pièces (un « incompatible » corrigé par une pièce ajoutée devient « réglé »).
  for (const it of plan.items) {
    for (const c of it.checks) {
      if (!LOCAL_CHECKS.has(c.label)) continue;
      put(c.status === "fail" ? { ...c, status: "fixed", detail: `${c.detail} → réglé dans ce plan.` } : c);
    }
  }

  // 2. Sortie vidéo
  if (gpu && !gpu.integrated) {
    put({ label: "Sortie vidéo", status: cpuGpu && !choice.gpu ? "fixed" : "ok", detail: `L'image passe par la ${gpu.name}.` });
  } else if (cpu?.igpu) {
    put({ label: "Sortie vidéo", status: "ok", detail: "L'image passe par la puce graphique du processeur." });
  } else {
    put({ label: "Sortie vidéo", status: "fail", detail: "Ni carte graphique, ni puce graphique dans le processeur : pas d'image." });
  }

  // 3. Port PCIe de la carte graphique, sur la carte mère FINALE
  if (gpu && !gpu.integrated) {
    let gen = newBoard?.kind === "board" ? newBoard.pcieGpu : p.pcieGen;
    if (gen && (cpu?.gen === "intel-10" || cpu?.gen === "amd-zen1" || cpu?.gen === "amd-zen1plus" || /ryzen \d (5500|5700|[45]\d{2}0gt?)\b/i.test(cpu?.name ?? ""))) gen = 3;
    if (gen === 3 && gpu.pcieLanes < 16) {
      put({ label: "Port PCIe", status: "warn", detail: `La ${gpu.name} n'utilise que ${gpu.pcieLanes} lignes PCIe : sur un port PCIe 3.0, elle perd ${gpu.pcieLanes === 4 ? "10 à 25 %" : "5 à 10 %"}.` });
    } else if (gen) {
      put({ label: "Port PCIe", status: "ok", detail: `La ${gpu.name} fonctionne sur un port PCIe ${gen}.0${newBoard ? " (nouvelle carte mère)" : ""}.` });
    }
  }

  // 3 bis. Épaisseur de la carte graphique sur la carte mère FINALE (une micro-ATX laisse moins de place)
  if (gpu && !gpu.integrated && (choice.gpu || newBoard)) {
    const thick = gpuThickness(newBoard?.kind === "board" ? { ...p, formFactor: newBoard.formFactor } : p, gpu);
    if (thick) out.set(thick.label, thick);
  }

  // 4. Alimentation et câbles pour le couple processeur + carte graphique FINAL
  const psuAdd = plan.additions.find((a) => a.part.kind === "psu");
  const psuChecks: Check[] = [];
  checkPower(p, cpu?.powerW, gpu, psuChecks, [], "pour cette config");
  for (const c of psuChecks) put(psuAdd?.role === "required" && c.status === "fail" ? { ...c, status: "fixed", detail: `${c.detail} → nouvelle alimentation incluse dans ce plan.` } : c);
  if (gpu && !gpu.integrated && (choice.gpu || cpuGpu)) {
    if (gpu.power === "12V-2x6") {
      const native = psuAdd?.role === "required" || p.psu12v2x6;
      put({ label: "Connecteur carte graphique", status: native ? "ok" : "warn", detail: native ? "Câble 12V-2x6 (16 broches) natif sur l'alimentation." : "Connecteur 12V-2x6 : utilise l'adaptateur fourni, branché sur des câbles PCIe 8 broches séparés." });
    } else if (gpu.power !== "none" && gpu.power !== "1x6" && gpu.power !== "1x8") {
      put({ label: "Connecteur carte graphique", status: psuAdd?.role === "required" ? "ok" : "warn", detail: gpu.power === "8+6" ? "Il faut un câble PCIe 8 broches et un câble 6 broches (un « 6+2 » convient) sur l'alimentation." : `Il faut ${gpu.power === "3x8" ? 3 : 2} câbles PCIe 8 broches séparés sur l'alimentation.${gpu.powerNote ? ` ${gpu.powerNote}` : ""}` });
    }
  }
  if (cpu && choice.cpu) put(epsCable(p, cpu, psuAdd?.role === "required"));

  // 5. Migration des disques si la carte mère change
  if (newBoard?.kind === "board") {
    const extra = choice.storage?.main.kind === "ssd" && choice.storage.main.iface.startsWith("NVMe") ? 1 : 0;
    put(storageMigration(p, newBoard, extra));
  }

  // 6. Équilibre final pour le jeu
  const ev = plan.evaluation;
  if (isGaming(goal.usage) && ev.fps != null) {
    const who = ev.limit === "cpu" ? "le processeur" : "la carte graphique";
    put({
      label: "Équilibre de la config",
      status: ev.fps >= goal.fps ? "ok" : "warn",
      detail: `≈ ${ev.fps} i/s dans les jeux récents ; c'est ${who} qui fixe la limite${ev.fps >= goal.fps ? ", au-dessus de ton objectif" : `, sous ton objectif de ${goal.fps} i/s`}.`,
    });
  }

  // Ordre d'affichage : problèmes d'abord, puis à vérifier, réglés, OK.
  return [...out.values()].sort((a, b) => RANK[a.status] - RANK[b.status]);
}

/**
 * Plan à partir d'un choix fait par l'utilisateur (« Ma sélection ») : mêmes pièces à adapter et
 * même vérification d'ensemble que les plans calculés.
 */
export function planFromChoice(goal: Goal, p: Profile, r: Report, choice: Partial<Record<Category, Proposal>>): Plan {
  const plan = buildPlan(goal, p, currentState(p, r), choice);
  plan.checks = validatePlan(goal, p, plan);
  return plan;
}

export interface OptimizeResult {
  current: Evaluation;
  /** Meilleur plan dans le budget (undefined si aucun ne fait mieux que la config actuelle). */
  best?: Plan;
  /** Plan le moins cher qui atteint l'objectif, quel que soit le budget. */
  cheapestReach?: Plan;
  /** Paliers : chaque plan fait nettement mieux que tous les plans moins chers. */
  tiers: Plan[];
  /** Autres options dans le budget, variées (cartes graphiques, processeurs, marques). */
  alternatives: Plan[];
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

  const tiers = pickTiers(frontier, cheapestReach);
  const alternatives = pickAlternatives(affordable, best, cheapestReach, goal, current.score);
  // Les plans affichés sont revérifiés comme des configs complètes.
  for (const pl of new Set([best, cheapestReach, ...tiers, ...alternatives])) if (pl) pl.checks = validatePlan(goal, p, pl);
  return { current, best, cheapestReach, tiers, alternatives };
}

/** Marque de la carte graphique d'un plan (pour varier les options proposées). */
function gpuBrand(pl: Plan): string {
  const g = pl.choice.gpu?.main;
  return g?.kind === "gpu" ? g.brand : "aucune";
}

/**
 * Autres options dans le budget : un plan par couple « carte graphique + processeur » (la meilleure variante RAM / stockage),
 * classés par objectif atteint, puis score, puis prix. On varie les marques (au plus 4 options par marque de carte graphique)
 * et on écarte les options nettement moins bonnes que la recommandation.
 */
function pickAlternatives(affordable: Plan[], best: Plan | undefined, reach: Plan | undefined, goal: Goal, currentScore: number, max = 6): Plan[] {
  if (!best) return [];
  const key = (pl: Plan) => `${pl.choice.gpu?.main.id ?? "-"}|${pl.choice.cpu?.main.id ?? "-"}`;
  const better = (a: Plan, b: Plan) =>
    Number(b.evaluation.reached) - Number(a.evaluation.reached) || b.evaluation.score - a.evaluation.score || a.cost - b.cost;

  const byKey = new Map<string, Plan>();
  for (const pl of affordable) {
    const prev = byKey.get(key(pl));
    if (!prev || better(pl, prev) < 0) byKey.set(key(pl), pl);
  }
  byKey.delete(key(best));

  // Pertinence : apporter au moins la moitié du gain de la recommandation ; sans budget fixé, pas beaucoup plus cher que l'objectif.
  const floor = currentScore + (best.evaluation.score - currentScore) * 0.5;
  const ceiling = goal.budget == null && reach ? reach.cost * 1.6 : Infinity;
  const candidates = [...byKey.values()]
    .filter((pl) => pl.evaluation.score >= floor && pl.cost <= ceiling)
    .sort((a, b) => Number(b.evaluation.reached) - Number(a.evaluation.reached) || Math.round((b.evaluation.score - a.evaluation.score) * 50) || a.cost - b.cost);

  // Variété : une option par modèle de carte graphique, deux par processeur, quatre par marque de carte graphique.
  const picked: Plan[] = [];
  const count = new Map<string, number>();
  const bump = (k: string) => count.set(k, (count.get(k) ?? 0) + 1);
  const used = (k: string) => count.get(k) ?? 0;
  const gpuId = (pl: Plan) => pl.choice.gpu?.main.id;
  const cpuId = (pl: Plan) => pl.choice.cpu?.main.id;
  if (gpuId(best)) bump(`gpu:${gpuId(best)}`);
  if (cpuId(best)) bump(`cpu:${cpuId(best)}`);
  bump(`brand:${gpuBrand(best)}`);
  for (const pl of candidates) {
    if (picked.length >= max) break;
    const g = gpuId(pl);
    const c = cpuId(pl);
    if (g && used(`gpu:${g}`) >= 1) continue;
    if (c && used(`cpu:${c}`) >= 2) continue;
    if (g && used(`brand:${gpuBrand(pl)}`) >= 4) continue;
    if (g) bump(`gpu:${g}`);
    if (c) bump(`cpu:${c}`);
    bump(`brand:${gpuBrand(pl)}`);
    picked.push(pl);
  }
  return picked;
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
