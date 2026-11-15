// Moteur de recommandations : des règles simples et vérifiables, appliquées au scan.
// Chaque règle explique le problème et, si c'est pertinent, propose un upgrade.

import type { Metrics, Report } from "./types";
import { gb, locale, yearsSince } from "./format";
import { tr } from "./settings";
import { RAM_KITS, SSDS, findBoard } from "./upgrade/catalog";
import { priceInfo } from "./upgrade/prices";

/** Fourchette de prix d'un composant du catalogue : min/max du marché si relevés, sinon son prix. */
function range(id: string, fallback: { min: number; max: number }) {
  const info = priceInfo(id);
  if (info) return { min: info.min, max: info.max };
  const part = [...RAM_KITS, ...SSDS].find((p) => p.id === id);
  return part ? { min: part.price, max: part.price } : fallback;
}

/** Nouveautés des BIOS (boards/*.json, en français) : version anglaise. */
const BIOS_WHAT_EN: Record<string, string> = {
  "prise en charge de Windows 11": "Windows 11 support",
  "correctif de faille de sécurité": "security vulnerability fix",
  "mise à jour des clés Secure Boot": "Secure Boot key update",
  "correction de la détection du TPM 2.0": "TPM 2.0 detection fix",
};

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
        tag: tr("Gain immédiat · gratuit", "Instant gain · free"),
        title: tr(`Écran réglé à ${d.currentHz} Hz au lieu de ${d.maxHz} Hz`, `Display set to ${d.currentHz} Hz instead of ${d.maxHz} Hz`),
        detail: tr(
          `Ton écran${d.primary ? " principal" : ""} accepte ${d.maxHz} Hz en ${d.width}×${d.height}, mais Windows l'affiche à ${d.currentHz} Hz. ` +
            "Va dans Paramètres › Système › Affichage › Affichage avancé › Fréquence d'actualisation. Utilise un câble DisplayPort branché sur la carte graphique.",
          `Your${d.primary ? " main" : ""} display supports ${d.maxHz} Hz at ${d.width}×${d.height}, but Windows runs it at ${d.currentHz} Hz. ` +
            "Go to Settings › System › Display › Advanced display › Choose a refresh rate. Use a DisplayPort cable plugged into the graphics card.",
        ),
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
      tag: tr("Gain important", "Big gain"),
      title: tr("Une seule barrette de RAM : la mémoire tourne en single channel", "Only one RAM stick: memory is running in single channel"),
      detail: tr(
        `Une seule barrette de ${gb(first.capacityBytes)} occupe ${slots} emplacements disponibles. ` +
          "Une seconde barrette identique active le dual channel, ce qui double la bande passante mémoire : plus d'images par seconde en jeu et un PC plus réactif.",
        `A single ${gb(first.capacityBytes)} stick sits in ${slots} available slots. ` +
          "A second identical stick turns on dual channel, which doubles memory bandwidth: more fps in games and a snappier PC.",
      ),
      upgrade: {
        component: tr("Mémoire vive", "Memory (RAM)"),
        suggestion: tr(
          `1 × ${gb(first.capacityBytes)} ${first.kind ?? ""}-${first.speedMts ?? ""} identique${ref ? ` (${ref})` : ""}`,
          `1 × identical ${gb(first.capacityBytes)} ${first.kind ?? ""}-${first.speedMts ?? ""}${ref ? ` (${ref})` : ""}`,
        ).replace(/\s+/g, " "),
        priceMin: priceRam(first.capacityBytes, first.kind).min,
        priceMax: priceRam(first.capacityBytes, first.kind).max,
      },
    });
  }
  if (total > 0 && total < 16 * GB) {
    out.push({
      id: "ram-low",
      level: total < 8 * GB ? "high" : "medium",
      tag: tr("Confort", "Comfort"),
      title: tr(`Seulement ${gb(total)} de RAM`, `Only ${gb(total)} of RAM`),
      detail: tr(
        "Aujourd'hui, 16 Go est le minimum confortable pour le jeu et le multitâche, et 32 Go pour la création (vidéo, 3D).",
        "These days, 16 GB is the comfortable minimum for gaming and multitasking, and 32 GB for creative work (video, 3D).",
      ),
      upgrade: {
        component: tr("Mémoire vive", "Memory (RAM)"),
        suggestion: tr("Kit 2 × 8 Go ou 2 × 16 Go, même type que l'actuel", "2 × 8 GB or 2 × 16 GB kit, same type as your current RAM"),
        ...ramKitRange(),
      },
    });
  }
  const used = live?.ramUsedBytes;
  const liveTotal = live?.ramTotalBytes;
  if (used && liveTotal && used / liveTotal > 0.85) {
    out.push({
      id: "ram-pressure",
      level: "medium",
      tag: tr("À surveiller", "Keep an eye on it"),
      title: tr(`Mémoire presque pleine (${Math.round((used / liveTotal) * 100)} %)`, `Memory almost full (${Math.round((used / liveTotal) * 100)}%)`),
      detail: tr(
        "Windows commence à utiliser le disque à la place de la RAM, ce qui ralentit tout. Ferme les onglets et logiciels inutiles, ou ajoute de la RAM.",
        "Windows is starting to use the drive instead of RAM, which slows everything down. Close tabs and apps you don't need, or add more RAM.",
      ),
    });
  }

  // --- Stockage ------------------------------------------------------------
  for (const d of r.disks) {
    if (d.health === "warning" || d.health === "unhealthy") {
      out.push({
        id: `disk-health-${d.name}`,
        level: "high",
        tag: tr("Urgent", "Urgent"),
        title: tr(`Le disque ${d.name ?? ""} signale un problème de santé`, `The drive ${d.name ?? ""} is reporting a health problem`),
        detail: tr(
          "Sauvegarde tes fichiers importants dès maintenant, puis prévois de remplacer ce disque.",
          "Back up your important files right now, then plan to replace this drive.",
        ),
        upgrade: { component: tr("Stockage", "Storage"), suggestion: tr("SSD NVMe 1 To de remplacement", "1 TB NVMe SSD as a replacement"), ...ssdRange("nvme-1tb") },
      });
    }
  }
  if (r.disks.length > 0 && r.disks.every((d) => d.media === "HDD")) {
    out.push({
      id: "no-ssd",
      level: "high",
      tag: tr("Gain énorme", "Huge gain"),
      title: tr("Windows tourne sur un disque dur mécanique", "Windows is running on a mechanical hard drive"),
      detail: tr(
        "Passer à un SSD est l'upgrade le plus visible : démarrage en quelques secondes, logiciels et jeux qui s'ouvrent beaucoup plus vite.",
        "Switching to an SSD is the most noticeable upgrade: startup in seconds, and apps and games that open much faster.",
      ),
      upgrade: {
        component: tr("Stockage", "Storage"),
        suggestion: tr("SSD 1 To (NVMe si la carte mère a un port M.2, sinon SATA)", "1 TB SSD (NVMe if the motherboard has an M.2 slot, otherwise SATA)"),
        ...ssdRange("sata-1tb", "nvme-1tb"),
      },
    });
  }
  for (const v of r.volumes) {
    if (!v.sizeBytes || v.freeBytes == null) continue;
    const free = v.freeBytes / v.sizeBytes;
    if (free < 0.15) {
      out.push({
        id: `vol-${v.letter}`,
        level: free < 0.05 ? "high" : "medium",
        tag: tr("Espace disque", "Disk space"),
        title: tr(`Le lecteur ${v.letter} est presque plein (${gb(v.freeBytes)} libres)`, `Drive ${v.letter} is almost full (${gb(v.freeBytes)} free)`),
        detail: tr(
          "En dessous de 15 % d'espace libre, Windows et les mises à jour ralentissent. Fais le ménage ou ajoute un second SSD pour tes jeux.",
          "Below 15% free space, Windows and updates slow down. Clean up, or add a second SSD for your games.",
        ),
        upgrade: {
          component: tr("Stockage", "Storage"),
          suggestion: tr("Second SSD NVMe 1 To pour les jeux et les fichiers", "Second 1 TB NVMe SSD for games and files"),
          ...ssdRange("nvme-1tb"),
        },
      });
    }
  }

  // --- Carte graphique -----------------------------------------------------
  for (const g of r.gpus) {
    if (g.vramBytes && g.vramBytes < 4 * GB) {
      out.push({
        id: `gpu-vram-${g.name}`,
        level: "medium",
        tag: tr("Jeu", "Gaming"),
        title: tr(`Carte graphique limitée (${gb(g.vramBytes)} de mémoire vidéo)`, `Limited graphics card (${gb(g.vramBytes)} of video memory)`),
        detail: tr("Les jeux récents demandent au moins 6 à 8 Go de mémoire vidéo, même en 1080p.", "Recent games need at least 6 to 8 GB of video memory, even at 1080p."),
        upgrade: {
          component: tr("Carte graphique", "Graphics card"),
          suggestion: tr("Carte avec 8 Go de VRAM ou plus", "Card with 8 GB of VRAM or more"),
          priceMin: 250,
          priceMax: 400,
        },
      });
    }
    const age = yearsSince(g.driverDate);
    if (age && age > 1) {
      out.push({
        id: `gpu-driver-${g.name}`,
        level: "low",
        tag: tr("Entretien", "Maintenance"),
        title: tr("Pilote graphique de plus d'un an", "Graphics driver over a year old"),
        detail: tr(
          `Le pilote de ${g.name ?? "ta carte graphique"} n'a pas été mis à jour depuis plus d'un an. Les nouveaux pilotes améliorent souvent les performances des jeux récents.`,
          `The driver for ${g.name ?? "your graphics card"} hasn't been updated in over a year. New drivers often improve performance in recent games.`,
        ),
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
    const security = missed.some((h) => /sécurité|security|secure boot|tpm|cve/i.test(h.what));
    const boardName = board!.name.replace(/^(MSI|ASUS|Gigabyte|ASRock)\s+/i, "");
    const updates = missed.map((h) => `${tr(h.what, BIOS_WHAT_EN[h.what] ?? h.what)} (${monthYear(h.date)})`).join(", ");
    const checked = new Date(latest.checked).toLocaleDateString(locale(), { day: "numeric", month: "long", year: "numeric" });
    out.push({
      id: "bios-old",
      level: security ? "medium" : "low",
      tag: security ? tr("Sécurité, gratuit", "Security, free") : tr("Facultatif, gratuit", "Optional, free"),
      title: tr(
        `BIOS à mettre à jour : tu as une version ${deMonth(r.board.biosDate!)}, la dernière date ${deMonth(latest.date)}`,
        `BIOS update available: you have a version from ${monthYear(r.board.biosDate!)}, the latest is from ${monthYear(latest.date)}`,
      ),
      detail: tr(
        `Depuis ta version, ta ${boardName} a reçu ${missed.length} mise${missed.length > 1 ? "s" : ""} à jour notable${missed.length > 1 ? "s" : ""} : ` +
          `${updates}. ` +
          (security ? "Les correctifs de sécurité, Secure Boot et TPM comptent pour Windows 11. " : "") +
          `Télécharge le BIOS ${latest.version} sur la page Support de ta carte mère (site du fabricant), copie-le sur une clé USB, puis installe-le depuis le BIOS avec ${tool}. ` +
          "Ne coupe pas le courant pendant l'opération (quelques minutes). " +
          `Dernière version relevée le ${checked}.`,
        `Since your version, your ${boardName} has received ${missed.length} notable update${missed.length > 1 ? "s" : ""}: ` +
          `${updates}. ` +
          (security ? "Security fixes, Secure Boot and TPM matter for Windows 11. " : "") +
          `Download BIOS ${latest.version} from your motherboard's Support page (manufacturer's website), copy it to a USB stick, then install it from the BIOS with ${tool}. ` +
          "Don't cut the power during the update (a few minutes). " +
          `Latest version checked on ${checked}.`,
      ),
    });
  } else if (biosAge && biosAge > 4) {
    out.push({
      id: "bios-old",
      level: "low",
      tag: tr("Facultatif", "Optional"),
      title: tr(
        `BIOS vieux de ${Math.floor(biosAge)} ans (version ${r.board.biosVersion ?? "?"})`,
        `BIOS is ${Math.floor(biosAge)} years old (version ${r.board.biosVersion ?? "?"})`,
      ),
      detail: tr(
        `Une version plus récente existe probablement sur le site du fabricant pour la ${r.board.product ?? "carte mère"} (page Support, onglet BIOS). ` +
          `Les mises à jour apportent surtout des correctifs de sécurité et la prise en charge de nouveaux processeurs. ` +
          `Si tu la fais, utilise ${tool} depuis le BIOS et ne coupe pas le courant pendant l'opération.`,
        `A newer version is probably available on the manufacturer's website for the ${r.board.product ?? "motherboard"} (Support page, BIOS tab). ` +
          `Updates mostly bring security fixes and support for new processors. ` +
          `If you do it, use ${tool} from the BIOS and don't cut the power during the update.`,
      ),
    });
  }

  // --- Réseau -------------------------------------------------------------
  for (const n of r.network) {
    if (n.connected && !n.wireless && n.speedBps && n.speedBps < 1e9) {
      out.push({
        id: `net-${n.name}`,
        level: "low",
        tag: tr("Réseau", "Network"),
        title: tr(`Connexion Ethernet limitée à ${Math.round(n.speedBps / 1e6)} Mbit/s`, `Ethernet connection limited to ${Math.round(n.speedBps / 1e6)} Mbit/s`),
        detail: tr(
          "Ta carte réseau devrait monter à 1 Gbit/s. Vérifie le câble (catégorie 5e minimum) et le port de la box.",
          "Your network adapter should reach 1 Gbit/s. Check the cable (Cat 5e minimum) and the port on your router.",
        ),
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
  return tr("l'outil de mise à jour intégré au BIOS", "the BIOS's built-in update tool");
}

const monthYear = (iso: string) => new Date(iso).toLocaleDateString(locale(), { month: "long", year: "numeric" });
/** « de mars 2024 », « d'octobre 2020 ». */
const deMonth = (iso: string) => { const m = monthYear(iso); return /^[aeiou]/i.test(m) ? `d'${m}` : `de ${m}`; };
