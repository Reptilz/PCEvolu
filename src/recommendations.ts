// Moteur de recommandations : des règles simples et vérifiables, appliquées au scan.
// Chaque règle explique le problème et, si c'est pertinent, propose un upgrade.

import type { Metrics, Report } from "./types";
import { gb, yearsSince } from "./format";
import { RAM_KITS, SSDS, findBoard } from "./upgrade/catalog";
import { priceInfo } from "./upgrade/prices";

/** Fourchette de prix d'un composant du catalogue : min/max du marché si relevés, sinon son prix. */
function range(id: string, fallback: { min: number; max: number }) {
  const info = priceInfo(id);
  if (info) return { min: info.min, max: info.max };
  const part = [...RAM_KITS, ...SSDS].find((p) => p.id === id);
  return part ? { min: part.price, max: part.price } : fallback;
}

export type Level = "high" | "medium" | "low";

export interface Upgrade {
  component: string;
  suggestion: string;
  /** Fourchette de prix indicative en euros. */
  priceMin?: number;
  priceMax?: number;
}

export interface Recommendation {
  id: string;
  level: Level;
  tag: string;
  title: string;
  detail: string;
  upgrade?: Upgrade;
}

const GB = 1024 ** 3;

export function recommend(r: Report, live?: Metrics): Recommendation[] {
  const out: Recommendation[] = [];

  // --- Écran sous sa fréquence maximale -----------------------------------
  for (const d of r.displays) {
    if (d.maxHz - d.currentHz >= 10) {
      out.push({
        id: `hz-${d.device}`,
        level: "high",
        tag: "Gain immédiat · gratuit",
        title: `Écran réglé à ${d.currentHz} Hz au lieu de ${d.maxHz} Hz`,
        detail:
          `Ton écran${d.primary ? " principal" : ""} accepte ${d.maxHz} Hz en ${d.width}×${d.height}, mais Windows l'affiche à ${d.currentHz} Hz. ` +
          "Va dans Paramètres › Système › Affichage › Affichage avancé › Fréquence d'actualisation. Utilise un câble DisplayPort branché sur la carte graphique.",
      });
    }
  }

  // --- RAM -----------------------------------------------------------------
  const mods = r.memory.modules;
  const slots = r.memory.slotsTotal ?? 0;
  const total = r.memory.totalBytes;
  const first = mods[0];
  if (mods.length === 1 && slots >= 2 && first) {
    const ref = [first.manufacturer, first.partNumber].filter(Boolean).join(" ");
    out.push({
      id: "ram-single-channel",
      level: "medium",
      tag: "Gain important",
      title: "Une seule barrette de RAM : la mémoire tourne en single channel",
      detail:
        `Une seule barrette de ${gb(first.capacityBytes)} occupe ${slots} emplacements disponibles. ` +
        "Une seconde barrette identique active le dual channel, ce qui double la bande passante mémoire : plus d'images par seconde en jeu et un PC plus réactif.",
      upgrade: {
        component: "Mémoire vive",
        suggestion: `1 × ${gb(first.capacityBytes)} ${first.kind ?? ""}-${first.speedMts ?? ""} identique${ref ? ` (${ref})` : ""}`.replace(/\s+/g, " "),
        priceMin: priceRam(first.capacityBytes, first.kind).min,
        priceMax: priceRam(first.capacityBytes, first.kind).max,
      },
    });
  }
  if (total > 0 && total < 16 * GB) {
    out.push({
      id: "ram-low",
      level: total < 8 * GB ? "high" : "medium",
      tag: "Confort",
      title: `Seulement ${gb(total)} de RAM`,
      detail: "Aujourd'hui, 16 Go est le minimum confortable pour le jeu et le multitâche, et 32 Go pour la création (vidéo, 3D).",
      upgrade: { component: "Mémoire vive", suggestion: "Kit 2 × 8 Go ou 2 × 16 Go, même type que l'actuel", ...ramKitRange() },
    });
  }
  const used = live?.ramUsedBytes;
  const liveTotal = live?.ramTotalBytes;
  if (used && liveTotal && used / liveTotal > 0.85) {
    out.push({
      id: "ram-pressure",
      level: "medium",
      tag: "À surveiller",
      title: `Mémoire presque pleine (${Math.round((used / liveTotal) * 100)} %)`,
      detail: "Windows commence à utiliser le disque à la place de la RAM, ce qui ralentit tout. Ferme les onglets et logiciels inutiles, ou ajoute de la RAM.",
    });
  }

  // --- Stockage ------------------------------------------------------------
  for (const d of r.disks) {
    if (d.health === "warning" || d.health === "unhealthy") {
      out.push({
        id: `disk-health-${d.name}`,
        level: "high",
        tag: "Urgent",
        title: `Le disque ${d.name ?? ""} signale un problème de santé`,
        detail: "Sauvegarde tes fichiers importants dès maintenant, puis prévois de remplacer ce disque.",
        upgrade: { component: "Stockage", suggestion: "SSD NVMe 1 To de remplacement", ...ssdRange("nvme-1tb") },
      });
    }
  }
  if (r.disks.length > 0 && r.disks.every((d) => d.media === "HDD")) {
    out.push({
      id: "no-ssd",
      level: "high",
      tag: "Gain énorme",
      title: "Windows tourne sur un disque dur mécanique",
      detail: "Passer à un SSD est l'upgrade le plus visible : démarrage en quelques secondes, logiciels et jeux qui s'ouvrent beaucoup plus vite.",
      upgrade: { component: "Stockage", suggestion: "SSD 1 To (NVMe si la carte mère a un port M.2, sinon SATA)", ...ssdRange("sata-1tb", "nvme-1tb") },
    });
  }
  for (const v of r.volumes) {
    if (!v.sizeBytes || v.freeBytes == null) continue;
    const free = v.freeBytes / v.sizeBytes;
    if (free < 0.15) {
      out.push({
        id: `vol-${v.letter}`,
        level: free < 0.05 ? "high" : "medium",
        tag: "Espace disque",
        title: `Le lecteur ${v.letter} est presque plein (${gb(v.freeBytes)} libres)`,
        detail: "En dessous de 15 % d'espace libre, Windows et les mises à jour ralentissent. Fais le ménage ou ajoute un second SSD pour tes jeux.",
        upgrade: { component: "Stockage", suggestion: "Second SSD NVMe 1 To pour les jeux et les fichiers", ...ssdRange("nvme-1tb") },
      });
    }
  }

  // --- Carte graphique -----------------------------------------------------
  for (const g of r.gpus) {
    if (g.vramBytes && g.vramBytes < 4 * GB) {
      out.push({
        id: `gpu-vram-${g.name}`,
        level: "medium",
        tag: "Jeu",
        title: `Carte graphique limitée (${gb(g.vramBytes)} de mémoire vidéo)`,
        detail: "Les jeux récents demandent au moins 6 à 8 Go de mémoire vidéo, même en 1080p.",
        upgrade: { component: "Carte graphique", suggestion: "Carte avec 8 Go de VRAM ou plus", priceMin: 250, priceMax: 400 },
      });
    }
    const age = yearsSince(g.driverDate);
    if (age && age > 1) {
      out.push({
        id: `gpu-driver-${g.name}`,
        level: "low",
        tag: "Entretien",
        title: "Pilote graphique de plus d'un an",
        detail: `Le pilote de ${g.name ?? "ta carte graphique"} n'a pas été mis à jour depuis plus d'un an. Les nouveaux pilotes améliorent souvent les performances des jeux récents.`,
      });
    }
  }

  // --- BIOS ---------------------------------------------------------------
  const biosAge = yearsSince(r.board.biosDate);
  const board = findBoard(r.board.product);
  const tool = flashTool(r.board.manufacturer ?? board?.name);
  const latest = board?.biosLatest;
  const installedAt = r.board.biosDate ? Date.parse(r.board.biosDate) : NaN;
  if (latest && !Number.isNaN(installedAt) && installedAt < Date.parse(latest.date)) {
    // Carte connue : on sait ce que les versions plus récentes apportent.
    const missed = latest.history.filter((h) => Date.parse(h.date) > installedAt);
    const security = missed.some((h) => /sécurité|secure boot|tpm|cve/i.test(h.what));
    out.push({
      id: "bios-old",
      level: security ? "medium" : "low",
      tag: security ? "Sécurité, gratuit" : "Facultatif, gratuit",
      title: `BIOS à mettre à jour : tu as une version ${deMonth(r.board.biosDate!)}, la dernière date ${deMonth(latest.date)}`,
      detail:
        `Depuis ta version, ta ${board!.name.replace(/^(MSI|ASUS|Gigabyte|ASRock)\s+/i, "")} a reçu ${missed.length} mise${missed.length > 1 ? "s" : ""} à jour notable${missed.length > 1 ? "s" : ""} : ` +
        `${missed.map((h) => `${h.what} (${monthYear(h.date)})`).join(", ")}. ` +
        (security ? "Les correctifs de sécurité, Secure Boot et TPM comptent pour Windows 11. " : "") +
        `Télécharge le BIOS ${latest.version} sur la page Support de ta carte mère (site du fabricant), copie-le sur une clé USB, puis installe-le depuis le BIOS avec ${tool}. ` +
        "Ne coupe pas le courant pendant l'opération (quelques minutes). " +
        `Dernière version relevée le ${new Date(latest.checked).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}.`,
    });
  } else if (biosAge && biosAge > 4) {
    out.push({
      id: "bios-old",
      level: "low",
      tag: "Facultatif",
      title: `BIOS vieux de ${Math.floor(biosAge)} ans (version ${r.board.biosVersion ?? "?"})`,
      detail:
        `Une version plus récente existe probablement sur le site du fabricant pour la ${r.board.product ?? "carte mère"} (page Support, onglet BIOS). ` +
        `Les mises à jour apportent surtout des correctifs de sécurité et la prise en charge de nouveaux processeurs. ` +
        `Si tu la fais, utilise ${tool} depuis le BIOS et ne coupe pas le courant pendant l'opération.`,
    });
  }

  // --- Réseau -------------------------------------------------------------
  for (const n of r.network) {
    if (n.connected && !n.wireless && n.speedBps && n.speedBps < 1e9) {
      out.push({
        id: `net-${n.name}`,
        level: "low",
        tag: "Réseau",
        title: `Connexion Ethernet limitée à ${Math.round(n.speedBps / 1e6)} Mbit/s`,
        detail: "Ta carte réseau devrait monter à 1 Gbit/s. Vérifie le câble (catégorie 5e minimum) et le port de la box.",
      });
    }
  }

  const order: Record<Level, number> = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

/** Prix d'une barrette seule de même capacité et même type (prix du marché si relevé). */
function priceRam(bytes?: number, kind?: string) {
  const g = Math.round((bytes ?? 0) / GB);
  const kit = RAM_KITS.find((k) => k.type === kind && k.sticks === 1 && k.gbPerStick === g);
  return kit ? range(kit.id, { min: kit.price, max: kit.price }) : { min: 30, max: 150 };
}

/** Fourchette couvrant un ou plusieurs SSD du catalogue. */
function ssdRange(...ids: string[]) {
  const r = ids.map((id) => range(id, { min: 60, max: 200 }));
  return { priceMin: Math.min(...r.map((x) => x.min)), priceMax: Math.max(...r.map((x) => x.max)) };
}

/** Fourchette d'un kit 2 × 8 Go à 2 × 16 Go DDR4 (la RAM actuelle est presque toujours en DDR4 quand elle est sous 16 Go). */
function ramKitRange() {
  const a = range("d4-2x8-3200", { min: 50, max: 200 });
  const b = range("d4-2x16-3200", { min: 85, max: 300 });
  return { priceMin: a.min, priceMax: b.max };
}

/** L'outil de mise à jour intégré au BIOS de chaque fabricant. */
function flashTool(maker?: string): string {
  const m = (maker ?? "").toLowerCase();
  if (/micro-star|msi/.test(m)) return "M-Flash";
  if (/asus/.test(m)) return "EZ Flash";
  if (/gigabyte/.test(m)) return "Q-Flash";
  if (/asrock/.test(m)) return "Instant Flash";
  return "l'outil de mise à jour intégré au BIOS";
}

const monthYear = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
/** « de mars 2024 », « d'octobre 2020 ». */
const deMonth = (iso: string) => { const m = monthYear(iso); return /^[aeiou]/i.test(m) ? `d'${m}` : `de ${m}`; };
