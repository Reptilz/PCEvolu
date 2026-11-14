// Moteur de compatibilité.
//
// Pour chaque composant candidat, on vérifie chaque contrainte face à la config actuelle.
// Quand une contrainte n'est pas respectée et qu'un autre composant peut la résoudre
// (alimentation trop faible, socket différent, RAM d'un autre type…), on ajoute ce composant
// à la proposition, puis on vérifie à son tour ce que ce nouveau composant implique.

import type {
  Addition, BoardSpec, Category, Check, CoolerSpec, CpuSpec, GpuSpec, Part, Proposal, PsuSpec, RamKit, Socket,
} from "./types";
import type { Profile } from "./profile";
import { BOARDS, CASES, COOLERS, CPUS, FAN_KITS, GPUS, PSUS, RAM_KITS, SSDS, CHIPSETS } from "./catalog";

// ---------------------------------------------------------------------------
// Outils communs
// ---------------------------------------------------------------------------

export const price = (p: Part) => ("price" in p && p.price != null ? p.price : 0);
const ceil50 = (w: number) => Math.ceil(w / 50) * 50;

/** Puissance nécessaire d'après la consommation réelle (CPU en jeu + carte + reste du PC, +30 % de marge). */
export function psuNeedReal(cpuPowerW: number | undefined, gpu: GpuSpec): number {
  const cpuW = (cpuPowerW ?? 150) * 0.7; // en jeu, le CPU reste rarement à son pic
  return ceil50((cpuW + gpu.tbp + 75) * 1.3);
}

/** Puissance conseillée : le plus prudent entre le calcul réel et la recommandation du fabricant. */
export function psuNeed(cpuPowerW: number | undefined, gpu: GpuSpec): number {
  return Math.max(gpu.psuRec, psuNeedReal(cpuPowerW, gpu));
}

function cheapestPsu(minW: number, needs12v2x6: boolean, pcie8: number): PsuSpec | undefined {
  return PSUS.filter((p) => p.watts >= minW && (!needs12v2x6 || p.native12v2x6) && p.pcie8pin >= pcie8).sort((a, b) => a.price - b.price)[0];
}

function cheapestCooler(socket: Socket, minW: number): CoolerSpec | undefined {
  return COOLERS.filter((c) => c.sockets.includes(socket) && c.capacityW >= minW).sort((a, b) => a.price - b.price)[0];
}

function finalize(
  base: Omit<Proposal, "total" | "totalIfVerify">,
): Proposal {
  const mainPrice = price(base.main) * base.mainQuantity;
  const sum = (roles: string[]) => base.additions.filter((a) => roles.includes(a.role)).reduce((s, a) => s + price(a.part) * a.quantity, 0);
  return { ...base, total: mainPrice + sum(["required"]), totalIfVerify: mainPrice + sum(["required", "verify"]) };
}

/** Câbles PCIe 8 broches nécessaires (0 si la carte utilise le connecteur 12V-2x6 natif de l'alim). */
const pcie8Needed = (g: GpuSpec) => (g.power === "3x8" ? 3 : g.power === "2x8" ? 2 : g.power === "1x8" ? 1 : 0);
/** Avec un adaptateur (alim sans câble 12V-2x6), une carte 16 broches demande 2 à 3 câbles 8 broches. */
const pcie8ViaAdapter = (g: GpuSpec) => (g.tbp > 300 ? 3 : 2);

/**
 * Vérifie l'alimentation pour une config donnée et ajoute une alimentation si besoin.
 * Partagé entre les upgrades de carte graphique et de processeur.
 */
export function checkPower(p: Profile, cpuPowerW: number | undefined, gpu: GpuSpec | undefined, checks: Check[], additions: Addition[], cause: string) {
  if (!gpu) {
    checks.push({ label: "Alimentation", status: "warn", detail: "Carte graphique actuelle non reconnue : vérifie que ton alimentation suffit." });
    return;
  }
  const need = psuNeed(cpuPowerW, gpu);
  const real = psuNeedReal(cpuPowerW, gpu);
  const needs16 = gpu.power === "12V-2x6";
  if (p.psuKnown) {
    if (p.psuWatts >= need) {
      checks.push({ label: "Alimentation", status: "ok", detail: `${need} W conseillés, ton alimentation fait ${p.psuWatts} W.` });
    } else if (p.psuWatts >= real) {
      // Le calcul réel passe, seule la marge très prudente du fabricant n'est pas atteinte.
      const psu = cheapestPsu(need, needs16, pcie8Needed(gpu));
      checks.push({ label: "Alimentation", status: "warn", detail: `Ta config consommera ≈ ${Math.round(real / 1.3 / 10) * 10} W en jeu : tes ${p.psuWatts} W suffisent si ton alim est de bonne qualité (80+ Bronze ou mieux, moins de 6-7 ans). Le fabricant conseille ${need} W par prudence.` });
      if (psu) additions.push({ role: "recommended", part: psu, quantity: 1, reason: `Si ton alimentation est d'entrée de gamme ou ancienne (${need} W conseillés par le fabricant).` });
    } else {
      const psu = cheapestPsu(need, needs16, pcie8Needed(gpu));
      checks.push({ label: "Alimentation", status: "fail", detail: `${need} W conseillés ${cause}, ton alimentation ne fait que ${p.psuWatts} W.` });
      if (psu) additions.push({ role: "required", part: psu, quantity: 1, reason: `Ton alimentation de ${p.psuWatts} W est trop juste (${need} W conseillés).` });
    }
  } else if (p.psuWatts >= need) {
    checks.push({ label: "Alimentation", status: "warn", detail: `${need} W conseillés. Ta config actuelle laisse supposer au moins ${p.psuWatts} W : confirme en lisant l'étiquette de l'alim.` });
  } else if (p.psuWatts >= real) {
    checks.push({ label: "Alimentation", status: "warn", detail: `${need} W conseillés par le fabricant, ≈ ${real} W suffisent d'après la consommation réelle. Ton alim n'est pas renseignée : lis son étiquette.` });
  } else {
    const psu = cheapestPsu(need, needs16, pcie8Needed(gpu));
    checks.push({ label: "Alimentation", status: "warn", detail: `${need} W conseillés ${cause}. Ton alimentation n'est pas renseignée : vu ta carte actuelle, elle fait peut-être moins (≈ ${p.psuWatts} W supposés).` });
    if (psu) additions.push({ role: "verify", part: psu, quantity: 1, reason: `Nécessaire si ton alimentation fait moins de ${need} W (lis l'étiquette sur son flanc).` });
  }
}

// ---------------------------------------------------------------------------
// Cartes graphiques
// ---------------------------------------------------------------------------

export function proposeGpus(p: Profile): Proposal[] {
  // Sur un portable, la puce graphique est soudée : rien à proposer.
  if (p.isLaptop) return [];
  const cur = p.gpu;
  const out: Proposal[] = [];

  for (const g of GPUS) {
    if (!g.availability) continue;
    if (cur && g.perf < cur.perf * 1.15) continue;

    const checks: Check[] = [];
    const additions: Addition[] = [];
    const notes: string[] = [];

    // 1. Port PCIe
    if (g.pcieLanes === 4 && p.pcieGen === 3) {
      checks.push({ label: "Port PCIe", status: "warn", detail: "Cette carte n'utilise que 4 lignes PCIe : sur ton port PCIe 3.0, elle perd 10 à 25 %. Une carte en x16 est préférable." });
    } else if (g.pcieLanes === 8 && p.pcieGen === 3) {
      checks.push({ label: "Port PCIe", status: "warn", detail: "Cette carte n'utilise que 8 lignes PCIe. Sur ton port PCIe 3.0, elle perd environ 5 à 10 % (davantage si sa mémoire vidéo sature)." });
    } else if (p.pcieGen) {
      checks.push({ label: "Port PCIe", status: "ok", detail: `Fonctionne sur ton port PCIe ${p.pcieGen}.0 x16${p.pcieGen < 4 ? " avec une perte négligeable (1 à 3 %)" : ""}.` });
    } else {
      checks.push({ label: "Port PCIe", status: "ok", detail: "Toute carte mère avec un port PCIe x16 convient." });
    }

    // PC de marque : boîtier, alimentation et carte mère souvent propriétaires.
    if (p.isOem) {
      checks.push({
        label: "PC de marque",
        status: "warn",
        detail: `Les PC ${p.manufacturer ?? "de marque"} ont souvent une alimentation propriétaire (180 à 300 W, sans câble PCIe) et un boîtier compact. Vérifie la fiche de ton modèle : une alimentation standard peut ne pas rentrer.`,
      });
    }

    // 2. Alimentation (puissance)
    checkPower(p, p.cpu?.powerW, g, checks, additions, "pour cette carte");
    const newPsu = additions.find((a) => a.part.kind === "psu");
    const psuReplaced = newPsu?.role === "required";
    const ifNewPsu = newPsu?.role === "verify" ? ` Si tu changes d'alimentation, la ${newPsu.part.name.split(" (")[0]} les a.` : "";

    // 3. Connecteurs d'alimentation
    if (g.power === "12V-2x6") {
      if (psuReplaced || p.psu12v2x6) {
        checks.push({ label: "Connecteur 16 broches", status: "ok", detail: psuReplaced ? "La nouvelle alimentation a le câble 12V-2x6 natif." : "Ton alimentation a un câble 12V-2x6 natif." });
      } else {
        checks.push({
          label: "Connecteur 16 broches", status: "warn",
          detail: `La carte utilise un connecteur 12V-2x6. Un adaptateur est fourni : il faut ${pcie8ViaAdapter(g)} câbles PCIe 8 broches séparés sur ton alim (pas un câble dédoublé).${ifNewPsu ? ` Si tu changes d'alimentation, la ${newPsu!.part.name.split(" (")[0]} a le câble natif.` : ""}`,
        });
      }
    } else if (g.power !== "1x8") {
      checks.push({ label: "Câbles PCIe", status: psuReplaced ? "ok" : "warn", detail: `Il faut ${pcie8Needed(g)} câbles PCIe 8 broches séparés${psuReplaced ? " : la nouvelle alimentation les a." : `. Vérifie que ton alim les a.${ifNewPsu}`}` });
    } else {
      checks.push({ label: "Câbles PCIe", status: "ok", detail: "1 câble PCIe 8 broches, comme ta carte actuelle." });
    }

    // 4. Place dans le boîtier
    if (p.gpuMaxMm != null) {
      if (g.lengthMm <= p.gpuMaxMm) {
        checks.push({ label: "Place dans le boîtier", status: "ok", detail: `≈ ${g.lengthMm} mm, ton boîtier accepte jusqu'à ${p.gpuMaxMm} mm.` });
      } else {
        const box = CASES.filter((c) => c.maxGpuMm >= g.lengthMm && (!p.formFactor || c.formFactors.includes(p.formFactor))).sort((a, b) => a.price - b.price)[0];
        checks.push({ label: "Place dans le boîtier", status: "fail", detail: `Les modèles courants mesurent ≈ ${g.lengthMm} mm, ton boîtier n'accepte que ${p.gpuMaxMm} mm.` });
        if (box) additions.push({ role: "required", part: box, quantity: 1, reason: `Pour loger une carte de ${g.lengthMm} mm. Alternative : chercher un modèle compact de cette carte (moins de ${p.gpuMaxMm} mm).` });
      }
    } else {
      checks.push({ label: "Place dans le boîtier", status: "warn", detail: `Les modèles courants mesurent ≈ ${g.lengthMm} mm : vérifie la longueur max dans la fiche de ton boîtier.` });
    }

    // 5. Ventilation : la chaleur supplémentaire doit sortir du boîtier
    const newCase = additions.some((a) => a.part.kind === "case");
    const extraHeat = g.tbp - (cur?.tbp ?? 150);
    if (!newCase && g.tbp >= 220) {
      const fans = p.caseFans;
      const kit = FAN_KITS[0];
      if (fans == null) {
        checks.push({ label: "Ventilation du boîtier", status: "warn", detail: `La carte dégage jusqu'à ${g.tbp} W. Il faut au moins 3 ventilateurs de boîtier (2 en façade, 1 à l'arrière).` });
        additions.push({ role: "verify", part: kit, quantity: 1, reason: "Si ton boîtier a moins de 3 ventilateurs." });
      } else if (fans < 2 || (fans < 3 && g.tbp >= 280)) {
        checks.push({ label: "Ventilation du boîtier", status: "fail", detail: `${fans} ventilateur${fans > 1 ? "s" : ""} ne suffi${fans > 1 ? "sent" : "t"} pas pour évacuer ${g.tbp} W : la carte chaufferait et baisserait ses fréquences.` });
        additions.push({ role: "required", part: kit, quantity: 1, reason: `Pour évacuer ${extraHeat > 0 ? `${extraHeat} W de chaleur en plus` : "la chaleur de la carte"} (vise 2 en façade + 1 à l'arrière, au minimum).` });
      } else if (fans < 3 && extraHeat >= 60) {
        checks.push({ label: "Ventilation du boîtier", status: "warn", detail: `${extraHeat} W de chaleur en plus : un 3e ventilateur améliorera les températures.` });
        additions.push({ role: "recommended", part: kit, quantity: 1, reason: "Pour garder la carte au frais et silencieuse." });
      } else {
        checks.push({ label: "Ventilation du boîtier", status: "ok", detail: `${fans >= 3 ? "3 ventilateurs ou plus" : `${fans} ventilateurs`} : suffisant pour ${g.tbp} W.` });
      }
    } else if (!newCase) {
      checks.push({ label: "Ventilation du boîtier", status: "ok", detail: `${g.tbp} W : une ventilation standard suffit.` });
    } else {
      const box = additions.find((a) => a.part.kind === "case")!.part;
      checks.push({ label: "Ventilation du boîtier", status: "ok", detail: `Le nouveau boîtier inclut ${"fansIncluded" in box ? box.fansIncluded : 3} ventilateurs.` });
    }

    // 6. Équilibre avec le processeur
    let gainPercent: number | undefined;
    let gainLabel: string | undefined;
    if (cur) {
      const ceiling = p.cpu?.gpuCeiling ?? Infinity;
      const effective = Math.min(g.perf, ceiling);
      gainPercent = Math.round((effective / Math.min(cur.perf, ceiling) - 1) * 100);
      gainLabel = cur.integrated
        ? `≈ ${Math.round(effective / cur.perf)} fois plus rapide que les graphiques intégrés`
        : `≈ +${gainPercent} % en jeu (1440p)`;
      if (p.cpu && g.perf > ceiling * 1.05) {
        const used = Math.round((ceiling / g.perf) * 100);
        const full = Math.round((g.perf / cur.perf - 1) * 100);
        if (!cur.integrated) gainLabel = `≈ +${gainPercent} % en jeu, plafonné par ton processeur (+${full} % avec un CPU plus récent)`;
        checks.push({ label: "Équilibre avec le processeur", status: "warn", detail: `Ton ${p.cpuDisplay} limitera cette carte : tu profiteras d'environ ${used} % de sa puissance en 1440p (moins en 1080p).` });
        notes.push("Regarde l'onglet Processeur pour équilibrer la config.");
      } else if (p.cpu) {
        checks.push({ label: "Équilibre avec le processeur", status: "ok", detail: `Ton ${p.cpuDisplay} peut exploiter cette carte.` });
      }
    }

    if (g.vramGb <= 8) notes.push("8 Go de mémoire vidéo devient juste en 1440p sur les jeux récents.");

    out.push(finalize({
      id: `gpu-${g.id}`, category: "gpu", title: g.name, main: g, mainQuantity: 1,
      gainPercent, gainLabel, checks, additions, notes,
    }));
  }
  return highlight(out.sort((a, b) => a.total - b.total));
}

// ---------------------------------------------------------------------------
// Processeurs
// ---------------------------------------------------------------------------

/** Les ventirads se fixent de la même façon entre ces sockets. */
function sameMounting(a?: Socket, b?: Socket) {
  if (!a || !b) return false;
  if (a === b) return true;
  const groups: Socket[][] = [["AM4", "AM5"], ["LGA1700", "LGA1851"], ["LGA1150", "LGA1151", "LGA1200"]];
  return groups.some((g) => g.includes(a) && g.includes(b));
}

export function proposeCpus(p: Profile): Proposal[] {
  // Sur un portable, le processeur est soudé : rien à proposer.
  if (p.isLaptop) return [];
  const cur = p.cpu;
  const out: Proposal[] = [];

  for (const c of CPUS) {
    if (!c.availability || !c.price) continue;
    const dropIn = !!p.chipset && c.socket === p.socket && p.chipset.cpuGens.includes(c.gen);
    // Changer de plateforme (carte mère, souvent RAM et ventirad) ne vaut le coup que pour un vrai gain.
    if (cur && c.gaming < cur.gaming * (dropIn ? 1.08 : 1.25)) continue;

    const checks: Check[] = [];
    const additions: Addition[] = [];
    const notes: string[] = [];

    if (dropIn) {
      checks.push({ label: "Carte mère", status: "ok", detail: `Compatible avec ta ${p.boardName ?? "carte mère"} (socket ${c.socket}, chipset ${p.chipset!.chipset}).` });
      if (p.chipset!.biosUpdateFor?.includes(c.gen)) {
        checks.push({ label: "BIOS", status: "warn", detail: "Mets à jour le BIOS AVANT d'installer ce processeur, sinon le PC ne démarrera pas." });
      }
      if (c.ramMaxMts.DDR4 && p.ramMts && c.ramMaxMts.DDR4 > p.ramMts && p.ramPlatformMaxMts && p.ramPlatformMaxMts < c.ramMaxMts.DDR4) {
        notes.push(`Avec ce processeur, ta carte mère autorise la RAM jusqu'à ${c.ramMaxMts.DDR4} MT/s.`);
      }
    } else {
      // Changement de plateforme : carte mère, puis RAM, puis ventirad.
      const plan = platformFor(c, p);
      if (!plan) continue;
      const { board, ram } = plan;
      checks.push({
        label: "Carte mère",
        status: "fail",
        detail: c.socket !== p.socket
          ? `Ce processeur utilise le socket ${c.socket}, ta carte mère est en ${p.socket ?? "?"}.`
          : `Ton chipset ${p.chipset?.chipset ?? ""} ne supporte pas cette génération de processeur.`,
      });
      additions.push({ role: "required", part: board, quantity: 1, reason: `Carte mère ${board.chipset} ${board.formFactor} compatible. ${board.note ?? ""}`.trim() });
      if (ram) {
        checks.push({ label: "Mémoire vive", status: "fail", detail: `La nouvelle carte mère utilise de la ${board.ramType}, ta RAM ${p.ramType ?? ""} n'est pas compatible.` });
        additions.push({ role: "required", part: ram, quantity: 1, reason: `${ram.sticks * ram.gbPerStick} Go en ${board.ramType}, en dual channel.` });
      } else {
        checks.push({ label: "Mémoire vive", status: "ok", detail: `Ta RAM ${p.ramType} actuelle est réutilisée.` });
      }
      if (board.formFactor === "ATX" && p.formFactor && p.formFactor !== "ATX") {
        checks.push({ label: "Format", status: "warn", detail: "Carte mère ATX : vérifie que ton boîtier l'accepte." });
      } else if (!p.formFactor) {
        checks.push({ label: "Format", status: "warn", detail: `Carte mère ${board.formFactor} : vérifie que ton boîtier l'accepte.` });
      } else if (board.formFactor === p.formFactor) {
        checks.push({ label: "Format", status: "ok", detail: `Format ${board.formFactor}, comme ta carte mère actuelle.` });
      } else {
        checks.push({ label: "Format", status: "ok", detail: `Format ${board.formFactor}, plus compact que ta carte ${p.formFactor} : il rentre dans ton boîtier.` });
      }
      const chip = CHIPSETS.find((x) => x.chipset === board.chipset);
      if (chip?.biosUpdateFor?.includes(c.gen)) {
        checks.push({ label: "BIOS", status: "warn", detail: "Certaines cartes en stock ont un BIOS trop ancien pour ce processeur : prends un modèle avec bouton de mise à jour du BIOS sans CPU." });
      }
      notes.push("Changer de carte mère peut demander de réactiver Windows (connecte ta licence à ton compte Microsoft avant).");
      if (p.isOem) {
        checks.push({
          label: "PC de marque",
          status: "warn",
          detail: `Les PC ${p.manufacturer ?? "de marque"} utilisent souvent un boîtier, une alimentation et une façade propriétaires : une carte mère standard peut ne pas se fixer ni se brancher. Vérifie le format exact, ou prévois un nouveau boîtier et une alimentation.`,
        });
      }
      if (c.gen === "intel-13" || c.gen === "intel-14") notes.push("Intel 13e/14e gén. : installe le dernier BIOS (microcode à jour) dès le montage.");
    }

    // Ventirad
    const coolNeed = Math.round(c.powerW * 0.75);
    const keepsMount = dropIn || sameMounting(p.socket, c.socket);
    if (p.cooler === "unknown") {
      checks.push({ label: "Ventirad", status: "warn", detail: `Il faut un ventirad capable de dissiper ≈ ${coolNeed} W${keepsMount ? "" : ` et compatible ${c.socket}`}.` });
      const cool = cheapestCooler(c.socket, coolNeed);
      if (cool && !(c.boxCooler && coolNeed <= 95)) additions.push({ role: "verify", part: cool, quantity: 1, reason: `Si ton ventirad actuel est d'origine ou ne supporte pas ${coolNeed} W.` });
    } else if (!keepsMount) {
      const cool = cheapestCooler(c.socket, coolNeed);
      checks.push({ label: "Ventirad", status: "fail", detail: `La fixation change entre ${p.socket} et ${c.socket} : ton ventirad actuel ne se monte pas (sauf kit de fixation vendu par son fabricant).` });
      if (cool) additions.push({ role: "required", part: cool, quantity: 1, reason: `Fixation ${c.socket} et ≈ ${coolNeed} W à dissiper.` });
    } else if ((p.coolerW ?? 0) < coolNeed) {
      const cool = cheapestCooler(c.socket, coolNeed);
      checks.push({ label: "Ventirad", status: "fail", detail: `Ton ventirad dissipe ≈ ${p.coolerW} W, ce processeur peut monter à ≈ ${coolNeed} W.` });
      if (cool) additions.push({ role: "required", part: cool, quantity: 1, reason: `Pour dissiper ≈ ${coolNeed} W sans surchauffe.` });
    } else {
      checks.push({ label: "Ventirad", status: "ok", detail: `Ton ventirad actuel suffit (≈ ${coolNeed} W).` });
    }

    // Alimentation avec la carte graphique actuelle
    checkPower(p, c.powerW, p.gpu, checks, additions, "avec ta carte graphique actuelle");

    // Gain réel : en jeu, les images/s dépendent du plus faible entre CPU et GPU.
    let gainPercent: number | undefined;
    let gainLabel: string | undefined;
    if (cur) {
      gainPercent = Math.round((c.gaming / cur.gaming - 1) * 100);
      gainLabel = `≈ +${gainPercent} % côté processeur`;
      if (p.gpu && p.gpu.perf <= cur.gpuCeiling) {
        checks.push({ label: "Équilibre avec la carte graphique", status: "warn", detail: `En 1440p, ta ${p.gpu.name} est déjà le facteur limitant : le gain se verra surtout en 1080p, sur les jeux gourmands en CPU et en multitâche.` });
      } else if (p.gpu) {
        checks.push({ label: "Équilibre avec la carte graphique", status: "ok", detail: `Ta ${p.gpu.name} est aujourd'hui freinée par ton processeur : ce changement la libère.` });
      }
    }

    out.push(finalize({
      id: `cpu-${c.id}`, category: "cpu",
      title: c.name + (c.availability === "used" ? " (occasion)" : ""),
      main: c, mainQuantity: 1, gainPercent, gainLabel, checks, additions, notes,
      highlight: dropIn ? "Sans changer de carte mère" : undefined,
    }));
  }
  return highlight(out.sort((a, b) => a.total - b.total));
}

/** Carte mère la moins chère (RAM comprise) pour accueillir ce processeur. */
function platformFor(c: CpuSpec, p: Profile): { board: BoardSpec; ram?: RamKit } | undefined {
  const caseOk = (b: BoardSpec) => !p.formFactor || p.formFactor === "ATX" || b.formFactor !== "ATX";
  const target = Math.max(16, p.ramTotalGb);
  let best: { board: BoardSpec; ram?: RamKit; cost: number } | undefined;
  for (const b of BOARDS) {
    if (!b.availability || !b.price || b.socket !== c.socket || !caseOk(b)) continue;
    const chip = CHIPSETS.find((x) => x.chipset === b.chipset);
    if (!chip?.cpuGens.includes(c.gen) || !c.ramMaxMts[b.ramType]) continue;
    // Les cartes A620 ont un étage d'alimentation léger : réservées aux processeurs sobres.
    if (b.chipset === "A620" && c.powerW > 120) continue;
    const reuse = b.ramType === p.ramType && p.ramModules > 0;
    const ram = reuse ? undefined : RAM_KITS.filter((k) => k.type === b.ramType && k.sticks === 2 && k.sticks * k.gbPerStick >= target).sort((x, y) => x.price - y.price)[0];
    if (!reuse && !ram) continue;
    // À prix proche, on préfère le même format que la carte actuelle.
    const cost = b.price + (ram?.price ?? 0) + (p.formFactor && b.formFactor !== p.formFactor ? 15 : 0);
    if (!best || cost < best.cost) best = { board: b, ram, cost };
  }
  return best;
}

// ---------------------------------------------------------------------------
// Mémoire vive
// ---------------------------------------------------------------------------

export function proposeRam(p: Profile): Proposal[] {
  // Portables (SO-DIMM, souvent soudée) et DDR3 (plus vendue neuve) : pas de proposition, voir le message de la vue.
  if (!p.ramType || p.isLaptop || !RAM_KITS.some((k) => k.type === p.ramType)) return [];
  const out: Proposal[] = [];
  const freeSlots = p.ramSlots - p.ramModules;
  const effective = (mts: number) => Math.min(mts, p.ramPlatformMaxMts ?? mts, p.ramMts && p.ramModules > 0 ? p.ramMts : mts);
  const speedCheck = (k: RamKit, mixed: boolean): Check => {
    const eff = mixed ? effective(k.mts) : Math.min(k.mts, p.ramPlatformMaxMts ?? k.mts);
    return eff < k.mts
      ? { label: "Vitesse", status: "ok", detail: `Tournera à ${eff} MT/s (${mixed ? "alignée sur ta barrette actuelle et " : ""}limite de ta plateforme). Normal et sans risque.` }
      : { label: "Vitesse", status: "ok", detail: `${k.mts} MT/s, supportés par ta plateforme.` };
  };
  const typeCheck: Check = { label: "Type de mémoire", status: "ok", detail: `${p.ramType}, comme ta carte mère.` };

  // 1. Compléter en dual channel avec une barrette identique
  if (p.ramModules === 1 && freeSlots >= 1 && p.ramStickGb) {
    const kit = RAM_KITS.filter((k) => k.type === p.ramType && k.sticks === 1 && k.gbPerStick === p.ramStickGb)[0];
    if (kit) {
      out.push(finalize({
        id: "ram-add-same", category: "ram", title: `Ajouter 1 × ${p.ramStickGb} Go (dual channel)`, main: kit, mainQuantity: 1,
        gainLabel: "Dual channel : ≈ +10 à 20 % d'images/s dans de nombreux jeux",
        checks: [
          typeCheck,
          { label: "Emplacement libre", status: "ok", detail: `${freeSlots} emplacement${freeSlots > 1 ? "s" : ""} libre${freeSlots > 1 ? "s" : ""} sur ${p.ramSlots}.` },
          speedCheck(kit, true),
          { label: "Barrettes assorties", status: "warn", detail: `Même capacité et même vitesse que ta barrette : le dual channel fonctionnera.${p.ramPartNumber ? ` L'idéal est la même référence (${p.ramPartNumber}).` : ""}` },
        ],
        additions: [],
        notes: [slotHint(p.ramSlotName)],
        highlight: "Meilleur rapport qualité/prix",
      }));
    }
  }

  // 2. Kits complets (remplacement ou ajout)
  for (const k of RAM_KITS.filter((x) => x.type === p.ramType && x.sticks === 2)) {
    const kitGb = k.sticks * k.gbPerStick;
    // Remplacement
    if (kitGb > p.ramTotalGb && (!p.ramMaxGb || kitGb <= p.ramMaxGb)) {
      out.push(finalize({
        id: `ram-replace-${k.id}`, category: "ram", title: `Passer à ${kitGb} Go (${k.sticks} × ${k.gbPerStick} Go)`, main: k, mainQuantity: 1,
        gainLabel: `${p.ramTotalGb} → ${kitGb} Go, en dual channel`,
        checks: [typeCheck, { label: "Capacité max", status: "ok", detail: `Ta carte mère accepte jusqu'à ${p.ramMaxGb ?? "?"} Go.` }, speedCheck(k, false)],
        additions: [],
        notes: [`Remplace ta barrette actuelle (tu peux la revendre). ${kitGb >= 64 ? "64 Go : utile pour le montage vidéo, la 3D ou les machines virtuelles, pas pour le jeu." : ""}`.trim()],
      }));
    }
    // Ajout d'un kit identique à une config déjà en dual channel
    if (p.ramModules === 2 && freeSlots >= 2 && p.ramStickGb === k.gbPerStick) {
      out.push(finalize({
        id: `ram-add-${k.id}`, category: "ram", title: `Ajouter ${kitGb} Go (total ${p.ramTotalGb + kitGb} Go)`, main: k, mainQuantity: 1,
        gainLabel: `${p.ramTotalGb} → ${p.ramTotalGb + kitGb} Go`,
        checks: [typeCheck, { label: "Emplacements libres", status: "ok", detail: "2 emplacements libres." }, speedCheck(k, true),
          { label: "4 barrettes", status: "warn", detail: "Avec 4 barrettes, la vitesse max baisse parfois légèrement." }],
        additions: [], notes: [],
      }));
    }
  }
  return out.sort((a, b) => a.total - b.total);
}

/** Où placer la 2e barrette : le même numéro d'emplacement, sur l'autre canal. */
function slotHint(slot?: string): string {
  const m = slot?.match(/Channel\s?([AB])[-_ ]?DIMM\s?(\d)/i);
  if (!m) return "Place la nouvelle barrette sur l'autre canal mémoire (voir le manuel de la carte mère pour l'emplacement exact).";
  const other = m[1].toUpperCase() === "A" ? "B" : "A";
  return `Ta barrette est en ${slot} : place la nouvelle en Channel${other}-DIMM${m[2]} pour activer le dual channel (repère sur la carte mère ou dans le manuel).`;
}

// ---------------------------------------------------------------------------
// Stockage
// ---------------------------------------------------------------------------

export function proposeStorage(p: Profile): Proposal[] {
  const out: Proposal[] = [];
  const m2Free = p.m2Total != null ? p.m2Total - p.m2Used : undefined;
  const gen = p.pcieGen ?? 3;

  for (const s of SSDS) {
    const checks: Check[] = [];
    const notes: string[] = [];
    if (p.isLaptop) {
      checks.push({
        label: "PC portable",
        status: "warn",
        detail: s.iface === "SATA"
          ? "Seulement si ton portable a un emplacement 2,5 pouces (de moins en moins courant) : vérifie la fiche de ton modèle."
          : "Les portables n'ont souvent qu'un emplacement M.2 : tu remplaces alors ton SSD actuel (clonage du disque à prévoir).",
      });
    }
    if (s.iface === "SATA") {
      checks.push({ label: "Branchement", status: "ok", detail: "Port SATA + câble SATA (souvent fourni avec la carte mère) + câble d'alimentation SATA." });
      if (m2Free && m2Free > 0) notes.push("Un SSD NVMe est 3 à 6 fois plus rapide pour un prix proche : préfère-le si tu as un emplacement M.2 libre.");
    } else {
      if (m2Free == null) {
        checks.push({ label: "Emplacement M.2", status: "warn", detail: "Carte mère non répertoriée : vérifie qu'il reste un emplacement M.2 libre." });
      } else if (m2Free <= 0) {
        continue; // pas de place : seules les options SATA restent proposées
      } else {
        checks.push({ label: "Emplacement M.2", status: "ok", detail: `${m2Free} emplacement${m2Free > 1 ? "s" : ""} M.2 libre${m2Free > 1 ? "s" : ""} sur ${p.m2Total}.` });
      }
      if (s.iface === "NVMe4" && gen < 4) {
        checks.push({ label: "Vitesse", status: "ok", detail: "SSD PCIe 4.0 sur ta plateforme PCIe 3.0 : il fonctionne, limité à ≈ 3 500 Mo/s. Inutile de payer plus cher pour un modèle haut de gamme." });
      } else {
        checks.push({ label: "Vitesse", status: "ok", detail: s.iface === "NVMe3" ? "≈ 3 500 Mo/s, la pleine vitesse de ton port." : "≈ 7 000 Mo/s." });
      }
      notes.push("Sur certaines cartes mères, le 2e emplacement M.2 désactive 1 ou 2 ports SATA : voir le manuel.");
    }
    out.push(finalize({
      id: `ssd-${s.id}`, category: "storage", title: s.name, main: s, mainQuantity: 1,
      gainLabel: `+${s.tb} To`, checks, additions: [], notes,
    }));
  }
  return highlight(out.sort((a, b) => a.main.kind === "ssd" && b.main.kind === "ssd" ? a.main.tb - b.main.tb || a.total - b.total : 0));
}

// ---------------------------------------------------------------------------

/** Marque la meilleure proposition en gain par euro. */
function highlight(list: Proposal[]): Proposal[] {
  const scored = list.filter((x) => x.gainPercent && x.gainPercent > 0 && x.total > 0 && !x.highlight);
  const best = scored.sort((a, b) => b.gainPercent! / b.totalIfVerify - a.gainPercent! / a.totalIfVerify)[0];
  if (best) best.highlight = "Meilleur rapport qualité/prix";
  return list;
}

export function proposeAll(p: Profile): Record<Category, Proposal[]> {
  return { gpu: proposeGpus(p), cpu: proposeCpus(p), ram: proposeRam(p), storage: proposeStorage(p) };
}
