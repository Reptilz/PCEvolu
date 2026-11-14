// Moteur de recommandations : des règles simples et vérifiables, appliquées au scan.
// Chaque règle explique le problème et, si c'est pertinent, propose un upgrade.

import type { Metrics, Report } from "./types";
import { gb, yearsSince } from "./format";

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
      upgrade: { component: "Mémoire vive", suggestion: "Kit 2 × 8 Go ou 2 × 16 Go, même type que l'actuel", priceMin: 35, priceMax: 90 },
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
        upgrade: { component: "Stockage", suggestion: "SSD NVMe 1 To de remplacement", priceMin: 55, priceMax: 90 },
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
      upgrade: { component: "Stockage", suggestion: "SSD 1 To (NVMe si la carte mère a un port M.2, sinon SATA)", priceMin: 50, priceMax: 90 },
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
        upgrade: { component: "Stockage", suggestion: "Second SSD NVMe 1 To pour les jeux et les fichiers", priceMin: 50, priceMax: 90 },
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
  if (biosAge && biosAge > 4) {
    out.push({
      id: "bios-old",
      level: "low",
      tag: "Facultatif",
      title: `BIOS vieux de ${Math.floor(biosAge)} ans (version ${r.board.biosVersion ?? "?"})`,
      detail: `Une version plus récente existe peut-être sur le site du fabricant pour la ${r.board.product ?? "carte mère"}. Ne le mets à jour que si tu rencontres un problème : l'opération comporte un petit risque.`,
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

function priceRam(bytes?: number, kind?: string) {
  const g = (bytes ?? 0) / GB;
  const ddr5 = kind === "DDR5";
  if (g >= 32) return ddr5 ? { min: 80, max: 120 } : { min: 60, max: 90 };
  if (g >= 16) return ddr5 ? { min: 45, max: 70 } : { min: 30, max: 50 };
  return { min: 15, max: 30 };
}
