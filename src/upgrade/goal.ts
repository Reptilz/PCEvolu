// « Mon objectif » : ce que l'utilisateur veut faire de son PC, et ce que sa config permet.
//
// Modèle d'images par seconde (jeux récents, qualité élevée) :
//   i/s permis par la carte graphique  = indice GPU × coefficient de la résolution
//   i/s permis par le processeur        = indice jeu CPU × 1,1 (ne dépend presque pas de la résolution)
//   i/s obtenus                         = le plus petit des deux → c'est le composant qui limite.
// Calibrage : RTX 3060 Ti (100) ≈ 95 i/s en 1080p, 70 en 1440p, 40 en 4K ; i5-10600K (100) ≈ 110 i/s max.
// Ce sont des ordres de grandeur sur un jeu récent « moyen » : les jeux compétitifs tournent bien plus vite.

import type { Report } from "../types";
import type { CpuSpec, GpuSpec } from "./types";
import type { Profile } from "./profile";

export type Usage = "office" | "gaming" | "creation" | "streaming";
export type Resolution = "1080p" | "1440p" | "4k";
export type FpsTarget = 60 | 100 | 144;

export interface Goal {
  usage: Usage;
  resolution: Resolution;
  fps: FpsTarget;
  /** Budget maximum en euros, null = pas de limite. */
  budget: number | null;
  /** false tant que l'utilisateur n'a pas répondu à l'assistant. */
  configured: boolean;
}

export const DEFAULT_GOAL: Goal = { usage: "gaming", resolution: "1440p", fps: 60, budget: 800, configured: false };

const KEY = "pcevolu.goal.v1";
export function loadGoal(): Goal {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_GOAL, ...JSON.parse(raw) } : DEFAULT_GOAL;
  } catch {
    return DEFAULT_GOAL;
  }
}
export function saveGoal(g: Goal) {
  try {
    localStorage.setItem(KEY, JSON.stringify(g));
  } catch {
    /* stockage indisponible */
  }
}

export const USAGE_LABEL: Record<Usage, string> = {
  office: "Bureautique & internet",
  gaming: "Jeu",
  creation: "Création (montage, photo, 3D)",
  streaming: "Jeu + streaming",
};
export const RES_LABEL: Record<Resolution, string> = { "1080p": "Full HD (1080p)", "1440p": "2K (1440p)", "4k": "4K (2160p)" };
export const FPS_LABEL: Record<FpsTarget, string> = { 60: "60 i/s", 100: "100 i/s", 144: "144 i/s" };
export const isGaming = (u: Usage) => u === "gaming" || u === "streaming";

/** Résumé court : « Jeu · 2K · 100 i/s · 800 € ». */
export function goalSummary(g: Goal): string {
  const parts = [USAGE_LABEL[g.usage]];
  if (isGaming(g.usage)) parts.push(RES_LABEL[g.resolution].split(" (")[0], FPS_LABEL[g.fps]);
  parts.push(g.budget == null ? "budget libre" : `${g.budget} €`);
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------
// Estimation des images par seconde
// ---------------------------------------------------------------------------

const GPU_FPS_PER_POINT: Record<Resolution, number> = { "1080p": 0.95, "1440p": 0.7, "4k": 0.4 };
const CPU_FPS_PER_POINT = 1.1;
/** Mémoire vidéo confortable pour les jeux récents en qualité élevée. */
export const VRAM_NEED: Record<Resolution, number> = { "1080p": 8, "1440p": 12, "4k": 16 };

export interface FpsEstimate {
  fps: number;
  gpuFps: number;
  cpuFps: number;
  limit: "gpu" | "cpu";
  vramShort: boolean;
}

export function estimateFps(cpu: CpuSpec | undefined, gpu: GpuSpec | undefined, res: Resolution, dualChannel = true): FpsEstimate | undefined {
  if (!cpu || !gpu) return undefined;
  const vramShort = !gpu.integrated && gpu.vramGb < VRAM_NEED[res];
  let gpuFps = gpu.perf * GPU_FPS_PER_POINT[res];
  // Mémoire vidéo saturée : textures réduites, saccades. On pénalise selon l'écart.
  if (vramShort) gpuFps *= VRAM_NEED[res] - gpu.vramGb >= 6 ? 0.75 : 0.88;
  let cpuFps = cpu.gaming * CPU_FPS_PER_POINT;
  // Une seule barrette de RAM (single channel) freine nettement le processeur en jeu.
  if (!dualChannel) cpuFps *= 0.88;
  const fps = Math.min(gpuFps, cpuFps);
  return { fps: Math.round(fps), gpuFps: Math.round(gpuFps), cpuFps: Math.round(cpuFps), limit: gpuFps <= cpuFps ? "gpu" : "cpu", vramShort };
}

// ---------------------------------------------------------------------------
// Diagnostic : la config actuelle répond-elle à l'objectif ?
// ---------------------------------------------------------------------------

export type NeedStatus = "ok" | "limited" | "missing";

export interface Need {
  id: string;
  label: string;
  status: NeedStatus;
  current: string;
  target: string;
  detail: string;
  /** Onglet d'upgrade qui résout ce besoin. */
  fix?: "gpu" | "cpu" | "ram" | "storage";
}

export interface Verdict {
  level: NeedStatus;
  title: string;
  summary: string;
  needs: Need[];
  fps?: FpsEstimate;
}

const worst = (a: NeedStatus, b: NeedStatus): NeedStatus =>
  a === "missing" || b === "missing" ? "missing" : a === "limited" || b === "limited" ? "limited" : "ok";

export function isDualChannel(p: Profile) {
  return p.ramModules >= 2;
}

export function assess(goal: Goal, p: Profile, r: Report): Verdict {
  const needs: Need[] = [];
  const hasSsd = r.disks.some((d) => d.media === "SSD");
  const hasNvme = r.disks.some((d) => d.bus === "NVMe");
  const ram = p.ramTotalGb;
  const dual = isDualChannel(p);
  let fps: FpsEstimate | undefined;

  // Stockage : un SSD change tout, quel que soit l'usage.
  needs.push(
    hasSsd
      ? { id: "ssd", label: "Disque", status: "ok", current: hasNvme ? "SSD NVMe" : "SSD", target: "SSD", detail: "Démarrage et ouverture des logiciels rapides." }
      : { id: "ssd", label: "Disque", status: "missing", current: "Disque dur mécanique", target: "SSD", detail: "Le disque dur est le premier frein d'un PC : démarrage lent, logiciels qui rament. Un SSD est l'upgrade le plus rentable.", fix: "storage" },
  );

  if (goal.usage === "office") {
    needs.push(
      ram >= 16
        ? { id: "ram", label: "Mémoire vive", status: "ok", current: `${ram} Go`, target: "8 à 16 Go", detail: "Confortable, même avec beaucoup d'onglets." }
        : ram >= 8
          ? { id: "ram", label: "Mémoire vive", status: "limited", current: `${ram} Go`, target: "16 Go", detail: "Suffisant, mais juste avec un navigateur chargé et Teams/Zoom.", fix: "ram" }
          : { id: "ram", label: "Mémoire vive", status: "missing", current: `${ram} Go`, target: "8 Go minimum", detail: "Trop peu : Windows 11 et un navigateur saturent 4 à 6 Go.", fix: "ram" },
    );
    const g = p.cpu?.gaming ?? 0;
    needs.push(
      g >= 55
        ? { id: "cpu", label: "Processeur", status: "ok", current: p.cpuDisplay, target: "4 cœurs récents", detail: "Largement suffisant pour la bureautique et la vidéo." }
        : { id: "cpu", label: "Processeur", status: "limited", current: p.cpuDisplay, target: "4 cœurs récents", detail: "Un peu juste : le PC peut ralentir avec plusieurs logiciels ouverts.", fix: "cpu" },
    );
    needs.push({ id: "gpu", label: "Carte graphique", status: "ok", current: p.gpu?.name ?? "—", target: "Pas nécessaire", detail: "La puce graphique intégrée suffit pour la bureautique, la vidéo et même la 4K en lecture." });
  }

  if (isGaming(goal.usage)) {
    fps = estimateFps(p.cpu, p.gpu, goal.resolution, dual);
    const target = goal.fps;
    const res = RES_LABEL[goal.resolution].split(" (")[0];
    if (fps) {
      const st = (v: number): NeedStatus => (v >= target ? "ok" : v >= target * 0.8 ? "limited" : "missing");
      needs.push({
        id: "gpu", label: "Carte graphique", status: st(fps.gpuFps), current: `≈ ${fps.gpuFps} i/s en ${res}`, target: `${target} i/s`,
        detail: p.gpu?.integrated
          ? "Les graphiques intégrés ne suffisent pas pour les jeux récents : une carte graphique dédiée est nécessaire."
          : fps.gpuFps >= target ? `Ta ${p.gpu?.name} tient l'objectif en ${res}.` : `Ta ${p.gpu?.name} plafonne à ≈ ${fps.gpuFps} i/s en ${res}.`,
        fix: fps.gpuFps < target ? "gpu" : undefined,
      });
      needs.push({
        id: "cpu", label: "Processeur", status: st(fps.cpuFps), current: `≈ ${fps.cpuFps} i/s max`, target: `${target} i/s`,
        detail: fps.cpuFps >= target ? `Ton ${p.cpuDisplay} peut alimenter ${target} i/s.` : `Ton ${p.cpuDisplay} ne peut pas dépasser ≈ ${fps.cpuFps} i/s, quelle que soit la carte graphique.`,
        fix: fps.cpuFps < target ? "cpu" : undefined,
      });
      if (p.gpu && !p.gpu.integrated) {
        const need = VRAM_NEED[goal.resolution];
        needs.push({
          id: "vram", label: "Mémoire vidéo", status: fps.vramShort ? "limited" : "ok", current: `${p.gpu.vramGb} Go`, target: `${need} Go en ${res}`,
          detail: fps.vramShort ? "Juste pour les jeux récents en qualité élevée : il faudra baisser les textures." : "Suffisante pour les textures en qualité élevée.",
          fix: fps.vramShort ? "gpu" : undefined,
        });
      }
    }
    needs.push(
      ram >= 16 && dual
        ? { id: "ram", label: "Mémoire vive", status: "ok", current: `${ram} Go${dual ? ", dual channel" : ""}`, target: "16 Go en dual channel", detail: "Bon pour le jeu." }
        : ram >= 16
          ? { id: "ram", label: "Mémoire vive", status: "limited", current: `${ram} Go en single channel`, target: "Dual channel", detail: "Une seule barrette : le processeur perd ≈ 10 à 15 % d'images/s.", fix: "ram" }
          : { id: "ram", label: "Mémoire vive", status: "missing", current: `${ram} Go`, target: "16 Go", detail: "Les jeux récents demandent 16 Go : en dessous, saccades et chargements.", fix: "ram" },
    );
    if (goal.usage === "streaming") {
      const m = p.cpu?.multi ?? 0;
      needs.push(
        m >= 120
          ? { id: "multi", label: "Processeur (streaming)", status: "ok", current: p.cpuDisplay, target: "8 cœurs ou plus", detail: "Assez de cœurs pour jouer, diffuser et gérer le chat en même temps." }
          : { id: "multi", label: "Processeur (streaming)", status: "limited", current: p.cpuDisplay, target: "8 cœurs ou plus", detail: "Encode avec la carte graphique (NVENC / AMF) dans OBS pour soulager le processeur.", fix: "cpu" },
      );
    }
  }

  if (goal.usage === "creation") {
    const m = p.cpu?.multi ?? 0;
    needs.push(
      m >= 180
        ? { id: "multi", label: "Processeur", status: "ok", current: p.cpuDisplay, target: "8 cœurs ou plus", detail: "Rendus et exports rapides." }
        : m >= 100
          ? { id: "multi", label: "Processeur", status: "limited", current: p.cpuDisplay, target: "8 cœurs ou plus", detail: "Correct, mais les exports vidéo et rendus 3D seront longs.", fix: "cpu" }
          : { id: "multi", label: "Processeur", status: "missing", current: p.cpuDisplay, target: "8 cœurs ou plus", detail: "Trop peu de cœurs pour le montage vidéo et la 3D.", fix: "cpu" },
    );
    needs.push(
      ram >= 32
        ? { id: "ram", label: "Mémoire vive", status: "ok", current: `${ram} Go`, target: "32 Go", detail: "Confortable pour la 4K et les gros projets." }
        : ram >= 16
          ? { id: "ram", label: "Mémoire vive", status: "limited", current: `${ram} Go`, target: "32 Go", detail: "Suffisant en 1080p, juste en 4K et en 3D.", fix: "ram" }
          : { id: "ram", label: "Mémoire vive", status: "missing", current: `${ram} Go`, target: "32 Go", detail: "Trop peu pour la création : 16 Go minimum, 32 Go conseillés.", fix: "ram" },
    );
    const gpu = p.gpu;
    needs.push(
      gpu && !gpu.integrated && gpu.vramGb >= 8 && gpu.perf >= 70
        ? { id: "gpu", label: "Carte graphique", status: "ok", current: gpu.name, target: "8 Go de VRAM", detail: "Accélère les exports (NVENC / AMF), les effets et le rendu 3D." }
        : { id: "gpu", label: "Carte graphique", status: gpu?.integrated ? "missing" : "limited", current: gpu?.name ?? "—", target: "8 Go de VRAM", detail: "Une carte récente accélère fortement les exports vidéo et la 3D.", fix: "gpu" },
    );
    if (!hasNvme && hasSsd) {
      needs.push({ id: "nvme", label: "Stockage de travail", status: "limited", current: "SSD SATA", target: "SSD NVMe", detail: "Un NVMe accélère la lecture des rushs 4K.", fix: "storage" });
    }
  }

  const level = needs.reduce<NeedStatus>((acc, n) => worst(acc, n.status), "ok");
  const res = RES_LABEL[goal.resolution].split(" (")[0];
  let title: string;
  let summary: string;
  if (level === "ok") {
    title = "Ton PC suffit pour ton objectif";
    summary = isGaming(goal.usage) && fps
      ? `≈ ${fps.fps} i/s en ${res} dans les jeux récents : l'objectif de ${goal.fps} i/s est atteint. Inutile de dépenser, sauf envie d'aller plus loin.`
      : "Aucune dépense nécessaire pour l'usage que tu as choisi.";
  } else {
    const blockers = needs.filter((n) => n.status !== "ok").map((n) => n.label.toLowerCase());
    title = level === "missing" ? "Ton PC n'atteint pas ton objectif" : "Ton PC y est presque";
    summary = (isGaming(goal.usage) && fps ? `≈ ${fps.fps} i/s en ${res} pour un objectif de ${goal.fps} i/s. ` : "") + `À améliorer : ${blockers.join(", ")}.`;
  }
  return { level, title, summary, needs, fps };
}

// ---------------------------------------------------------------------------
// Effet d'une proposition sur l'objectif
// ---------------------------------------------------------------------------

export interface Impact {
  /** La proposition fait-elle avancer l'objectif choisi ? */
  relevant: boolean;
  reachesGoal: boolean;
  label?: string;
  fpsAfter?: number;
}

/** Les meilleures propositions vérifiées d'une catégorie, dans le budget, classées selon l'objectif. */
export function topOptions(
  goal: Goal, p: Profile, verdict: Verdict,
  list: { id: string; total: number; main: { kind: string; brand?: string } & Record<string, unknown> }[],
  category: "gpu" | "cpu" | "ram" | "storage", n = 3,
) {
  const ramAfter = (x: (typeof list)[number]) => {
    if (x.main.kind !== "ram") return undefined;
    const kit = (x.main.sticks as number) * (x.main.gbPerStick as number);
    return x.id.startsWith("ram-add") ? p.ramTotalGb + kit : kit;
  };
  const scored = list
    .map((x) => ({ proposal: x, impact: impactOf(goal, p, verdict, x.main, category, ramAfter(x)) }))
    .filter((s) => (goal.budget == null || s.proposal.total <= goal.budget) && (!goal.configured || s.impact.relevant || s.impact.reachesGoal));
  scored.sort((a, b) => Number(b.impact.reachesGoal) - Number(a.impact.reachesGoal) || (b.impact.fpsAfter ?? 0) - (a.impact.fpsAfter ?? 0) || a.proposal.total - b.proposal.total);
  // Variété : pas deux fois la même marque en tête de liste si une autre est disponible.
  const out: typeof scored = [];
  const brands = new Set<string>();
  for (const s of scored) {
    if (out.length >= n) break;
    const b = s.proposal.main.brand;
    if (b && brands.has(b) && scored.some((o) => !out.includes(o) && o !== s && o.proposal.main.brand && !brands.has(o.proposal.main.brand))) continue;
    if (b) brands.add(b);
    out.push(s);
  }
  for (const s of scored) if (out.length < n && !out.includes(s)) out.push(s);
  return out;
}

export function impactOf(goal: Goal, p: Profile, verdict: Verdict, main: { kind: string }, category: "gpu" | "cpu" | "ram" | "storage", ramAfterGb?: number): Impact {
  const fixes = new Set(verdict.needs.filter((n) => n.status !== "ok").map((n) => n.fix));
  const res = RES_LABEL[goal.resolution].split(" (")[0];

  if (isGaming(goal.usage) && verdict.fps && (category === "gpu" || category === "cpu" || category === "ram")) {
    const cpu = category === "cpu" ? (main as CpuSpec) : p.cpu;
    const gpu = category === "gpu" ? (main as GpuSpec) : p.gpu;
    const dual = category === "ram" ? true : isDualChannel(p);
    const after = estimateFps(cpu, gpu, goal.resolution, dual);
    if (!after) return { relevant: fixes.has(category), reachesGoal: false };
    const before = verdict.fps.fps;
    const better = after.fps > before;
    // Une carte graphique n'atteint vraiment l'objectif que si sa mémoire vidéo suffit aussi.
    const vramShort = category === "gpu" && after.vramShort;
    const reaches = after.fps >= goal.fps && !vramShort;
    const capacityOnly = category === "ram" && !better;
    const limitBy = after.limit === "cpu" ? "le processeur" : "la carte graphique";
    return {
      relevant: better || (category === "ram" && fixes.has("ram")),
      reachesGoal: reaches && !capacityOnly,
      fpsAfter: after.fps,
      label: capacityOnly
        ? undefined
        : better
          ? `≈ ${before} → ${after.fps} i/s en ${res}` +
            (after.fps < goal.fps ? `, limité par ${limitBy}` : vramShort ? `, mais mémoire vidéo juste en ${res}` : "")
          : `Pas de gain en ${res} : ${limitBy} reste le facteur limitant`,
    };
  }

  if (goal.usage === "creation" && category === "cpu") {
    const multi = (main as CpuSpec).multi ?? 0;
    const gain = p.cpu ? Math.round((multi / p.cpu.multi - 1) * 100) : 0;
    return { relevant: gain > 10, reachesGoal: multi >= 180, label: gain > 0 ? `≈ +${gain} % en rendu et export` : undefined };
  }
  if (goal.usage === "creation" && category === "ram") {
    return { relevant: fixes.has("ram"), reachesGoal: (ramAfterGb ?? 0) >= 32 };
  }
  if (goal.usage === "office" && category === "gpu") {
    return { relevant: false, reachesGoal: false, label: "Inutile pour la bureautique" };
  }
  return { relevant: fixes.has(category), reachesGoal: fixes.has(category) };
}

/** La fluidité en un mot, pour lire un nombre d'images par seconde sans connaître le jargon. */
export function fluidity(fps: number): string {
  if (fps < 30) return "Saccadé";
  if (fps < 55) return "Jouable";
  if (fps < 90) return "Fluide";
  if (fps < 140) return "Très fluide";
  return "Ultra fluide";
}
