// Moteur de compatibilité.
//
// Pour chaque composant candidat, on vérifie chaque contrainte face à la config actuelle.
// Quand une contrainte n'est pas respectée et qu'un autre composant peut la résoudre
// (alimentation trop faible, socket différent, RAM d'un autre type…), on ajoute ce composant
// à la proposition, puis on vérifie à son tour ce que ce nouveau composant implique.

import type {
  Addition, BiosFamily, BoardSpec, Category, Check, ModelPick, CoolerSpec, CpuSpec, GpuSpec, Part, Proposal, PsuSpec, RamKit, Socket,
} from "./types";
import type { Profile } from "./profile";
import { BOARDS, CASES, COOLERS, CPUS, FAN_KITS, GPUS, PSUS, RAM_KITS, SSDS, CHIPSETS } from "./catalog";
import { KNOWN_BOARDS } from "./boards";

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
const pcie8Needed = (g: GpuSpec) => (g.power === "3x8" ? 3 : g.power === "2x8" || g.power === "8+6" ? 2 : g.power === "1x8" ? 1 : 0);
/**
 * Avec l'adaptateur fourni (alim sans câble 12V-2x6), une carte 16 broches demande des câbles 8 broches séparés :
 * 2 jusqu'à 300 W (RTX 4070 Ti, 5070, 5070 Ti), 3 jusqu'à 450 W (RTX 4080, 4090, 5080), 4 au-delà (RTX 5090).
 */
const pcie8ViaAdapter = (g: GpuSpec) => (g.tbp > 450 ? 4 : g.tbp > 300 ? 3 : 2);

/**
 * Vérifie l'alimentation pour une config donnée et ajoute une alimentation si besoin.
 * Partagé entre les upgrades de carte graphique et de processeur.
 */
/**
 * Modèles réels vérifiés pour les alimentations génériques (fiches Corsair et MSI, novembre 2026).
 * Attention au nom : les Corsair RMe « 2023 » n'ont pas le câble 12V-2x6 natif, seuls les « 2025 » l'ont.
 */
const PSU_MODELS: Record<string, ModelPick[]> = {
  "psu-650": [{ name: "Corsair RM650e (modèle 2025, réf. CP-9020302)", why: ["80+ Gold", "ATX 3.1", "câble 12V-2x6 natif"] }],
  "psu-750": [{ name: "Corsair RM750e (modèle 2025, réf. CP-9020295)", why: ["80+ Gold", "ATX 3.1", "câble 12V-2x6 natif"] }],
  "psu-850": [
    { name: "Corsair RM850e (modèle 2025, réf. CP-9020296)", why: ["80+ Gold", "ATX 3.1", "câble 12V-2x6 natif"] },
    { name: "MSI MAG A850GL PCIE5", why: ["80+ Gold", "1 connecteur 16 broches + 4 × 8 broches"], url: "https://www.msi.com/Power-Supply/MAG-A850GL-PCIE5/Specification" },
  ],
  "psu-1000": [{ name: "Corsair RM1000e (modèle 2025, réf. CP-9020297)", why: ["80+ Gold", "ATX 3.1", "câble 12V-2x6 natif"] }],
};

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
      if (psu) additions.push({ role: "recommended", part: psu, quantity: 1, models: PSU_MODELS[psu.id], reason: `Si ton alimentation est d'entrée de gamme ou ancienne (${need} W conseillés par le fabricant).` });
    } else {
      const psu = cheapestPsu(need, needs16, pcie8Needed(gpu));
      checks.push({ label: "Alimentation", status: "fail", detail: `${need} W conseillés ${cause}, ton alimentation ne fait que ${p.psuWatts} W.` });
      if (psu) additions.push({ role: "required", part: psu, quantity: 1, models: PSU_MODELS[psu.id], reason: `Ton alimentation de ${p.psuWatts} W est trop juste (${need} W conseillés).` });
    }
  } else if (p.psuWatts >= need) {
    checks.push({ label: "Alimentation", status: "warn", detail: `${need} W conseillés. Ta config actuelle laisse supposer au moins ${p.psuWatts} W : confirme en lisant l'étiquette de l'alim.` });
  } else if (p.psuWatts >= real) {
    checks.push({ label: "Alimentation", status: "warn", detail: `${need} W conseillés par le fabricant, ≈ ${real} W suffisent d'après la consommation réelle. Ton alim n'est pas renseignée : lis son étiquette.` });
  } else {
    const psu = cheapestPsu(need, needs16, pcie8Needed(gpu));
    checks.push({ label: "Alimentation", status: "warn", detail: `${need} W conseillés ${cause}. Ton alimentation n'est pas renseignée : vu ta carte actuelle, elle fait peut-être moins (≈ ${p.psuWatts} W supposés).` });
    if (psu) additions.push({ role: "verify", part: psu, quantity: 1, models: PSU_MODELS[psu.id], reason: `Nécessaire si ton alimentation fait moins de ${need} W (lis l'étiquette sur son flanc).` });
  }
}

// ---------------------------------------------------------------------------
// Cartes graphiques
// ---------------------------------------------------------------------------

/**
 * Partages de lignes de la carte mère qui concernent ce PC : les notes propres aux Ryzen 8000G
 * ne s'affichent qu'avec un Ryzen 8000G installé.
 */
function relevantSharing(p: Profile): string[] {
  const apu8000 = /ryzen \d 8\d00g/i.test(p.cpu?.name ?? "");
  return (p.board?.sharing ?? []).filter((s) => !/Ryzen (\d )?8\d00G|Ryzen 8000G/.test(s) || apu8000);
}

export function proposeGpus(p: Profile, cpuProposals: Proposal[] = []): Proposal[] {
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
    // Partage du port graphique sur ta carte (ex. « utiliser le M2_2 fait passer le port en x8 »).
    const gpuSharing = relevantSharing(p).filter((s) => /carte graphique/i.test(s));
    if (gpuSharing.length) {
      const last = checks[checks.length - 1];
      checks[checks.length - 1] = { ...last, detail: `${last.detail} À savoir sur ta carte mère : ${gpuSharing.join(" ")}` };
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
    const ifNewPsu = newPsu?.role === "verify" ? ` Si tu changes d'alimentation, celle proposée (${"watts" in newPsu.part ? newPsu.part.watts : ""} W) les a.` : "";

    // 3. Connecteurs d'alimentation
    if (g.power === "12V-2x6") {
      if (psuReplaced || p.psu12v2x6) {
        checks.push({ label: "Connecteur 16 broches", status: "ok", detail: psuReplaced ? "La nouvelle alimentation a le câble 12V-2x6 natif." : "Ton alimentation a un câble 12V-2x6 natif." });
      } else {
        checks.push({
          label: "Connecteur 16 broches", status: "warn",
          detail: `La carte utilise un connecteur 12V-2x6. Un adaptateur est fourni : il faut ${pcie8ViaAdapter(g)} câbles PCIe 8 broches séparés sur ton alim (pas un câble dédoublé).${ifNewPsu ? ` Si tu changes d'alimentation, celle proposée a le câble natif.` : ""}`,
        });
      }
    } else if (g.power === "8+6") {
      checks.push({ label: "Câbles PCIe", status: psuReplaced ? "ok" : "warn", detail: `Il faut un câble PCIe 8 broches et un câble 6 broches (un câble « 6+2 » convient)${psuReplaced ? " : la nouvelle alimentation les a." : `. Vérifie que ton alim les a.${ifNewPsu}`}` });
    } else if (g.power === "2x8" || g.power === "3x8") {
      checks.push({ label: "Câbles PCIe", status: psuReplaced ? "ok" : "warn", detail: `Il faut ${pcie8Needed(g)} câbles PCIe 8 broches séparés${psuReplaced ? " : la nouvelle alimentation les a." : `. Vérifie que ton alim les a.${ifNewPsu}`}` });
    } else if (g.power === "1x8") {
      const curNeeds = cur?.power;
      checks.push({
        label: "Câbles PCIe",
        status: "ok",
        detail: curNeeds && curNeeds !== "none" && curNeeds !== "1x6" ? "1 câble PCIe 8 broches, comme ta carte actuelle." : "1 câble PCIe 8 broches : présent sur toutes les alimentations de PC de jeu.",
      });
    } else {
      checks.push({ label: "Câbles PCIe", status: "ok", detail: g.power === "none" ? "Aucun câble : la carte est alimentée par le port PCIe." : "1 câble PCIe 6 broches." });
    }
    // Branchement différent selon le modèle partenaire : on le signale, sans changer le verdict.
    if (g.powerNote) {
      const last = checks[checks.length - 1];
      checks[checks.length - 1] = { ...last, detail: `${last.detail} ${g.powerNote}` };
    }

    // 4. Place dans le boîtier
    // Les longueurs varient beaucoup selon le modèle (ex. RTX 5070 : de 229 à 338 mm). On compare aux modèles
    // les plus longs quand on les connaît ; sinon, une marge de 30 mm sous la longueur typique reste « à vérifier ».
    const longest = g.lengthMaxMm ?? g.lengthMm + 30;
    if (p.gpuMaxMm != null) {
      if (longest <= p.gpuMaxMm) {
        checks.push({ label: "Place dans le boîtier", status: "ok", detail: `${g.lengthMaxMm ? `Jusqu'à ${g.lengthMaxMm} mm pour les modèles les plus longs` : `≈ ${g.lengthMm} mm`}, ton boîtier accepte jusqu'à ${p.gpuMaxMm} mm.` });
      } else if (g.lengthMm <= p.gpuMaxMm) {
        checks.push({
          label: "Place dans le boîtier",
          status: "warn",
          detail: `Ton boîtier accepte ${p.gpuMaxMm} mm : la plupart des modèles (≈ ${g.lengthMm} mm) rentrent, mais pas les plus longs${g.lengthMaxMm ? ` (jusqu'à ${g.lengthMaxMm} mm)` : ""}. Vérifie la longueur du modèle exact sur sa fiche (compte 15 à 20 mm de marge pour les câbles).`,
        });
      } else {
        const box = CASES.filter((c) => c.maxGpuMm >= g.lengthMm && (!p.formFactor || c.formFactors.includes(p.formFactor))).sort((a, b) => a.price - b.price)[0];
        checks.push({ label: "Place dans le boîtier", status: "fail", detail: `Les modèles courants mesurent ≈ ${g.lengthMm} mm, ton boîtier n'accepte que ${p.gpuMaxMm} mm.` });
        if (box) additions.push({ role: "required", part: box, quantity: 1, reason: `Pour loger une carte de ${g.lengthMm} mm. Alternative : chercher un modèle compact de cette carte (moins de ${p.gpuMaxMm} mm).` });
      }
    } else {
      checks.push({
        label: "Place dans le boîtier",
        status: "warn",
        detail: `Les modèles courants mesurent ≈ ${g.lengthMm} mm${g.lengthMaxMm ? `, jusqu'à ${g.lengthMaxMm} mm pour les plus longs` : ""} : vérifie la longueur max dans la fiche de ton boîtier.`,
      });
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

    // 5 bis. Épaisseur de la carte
    const thick = gpuThickness(p, g);
    if (thick) checks.push(thick);

    // 6. Équilibre avec le processeur
    let pairing: Proposal["pairing"];
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
        pairing = pairCpu(g, used, cpuProposals);
        if (!pairing) notes.push("Regarde l'onglet Processeur pour équilibrer la config.");
      } else if (p.cpu) {
        checks.push({ label: "Équilibre avec le processeur", status: "ok", detail: `Ton ${p.cpuDisplay} peut exploiter cette carte.` });
      }
    }

    if (g.vramGb <= 8) notes.push("8 Go de mémoire vidéo devient juste en 1440p sur les jeux récents.");

    out.push(finalize({
      id: `gpu-${g.id}`, category: "gpu", title: g.name, main: g, mainQuantity: 1,
      gainPercent, gainLabel, checks, additions, notes, pairing,
    }));
  }
  return highlight(out.sort((a, b) => a.total - b.total));
}

/**
 * Processeur à associer à une carte graphique bridée : le moins cher (avec ce qu''il entraîne) qui l''exploite
 * à 95 % au moins ; à défaut, celui qui l''exploite le mieux, s''il fait vraiment mieux que l''actuel.
 */
function pairCpu(g: GpuSpec, usedBefore: number, cpuProposals: Proposal[]): Proposal["pairing"] {
  const usedWith = (c: CpuSpec) => Math.min(100, Math.round((c.gpuCeiling / g.perf) * 100));
  const cpus = cpuProposals.filter((x) => x.main.kind === "cpu" && !x.checks.some((c) => c.status === "fail"));
  const enough = cpus.filter((x) => usedWith(x.main as CpuSpec) >= 95).sort((a, b) => a.total - b.total)[0];
  const best = enough ?? cpus.sort((a, b) => usedWith(b.main as CpuSpec) - usedWith(a.main as CpuSpec) || a.total - b.total)[0];
  if (!best) return undefined;
  const usedAfter = usedWith(best.main as CpuSpec);
  if (usedAfter < usedBefore + 10) return undefined;
  const required = best.additions.filter((a) => a.role === "required" && a.part.kind !== "psu").map((a) => a.part);
  return { cpu: best.main, parts: required, extra: best.total, usedBefore, usedAfter };
}

// ---------------------------------------------------------------------------
// Processeurs
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Vérifications partagées (propositions seules et plans combinés)
// ---------------------------------------------------------------------------

/** Carte graphique neuve la moins chère : le minimum pour avoir une image. */
export function cheapestGpu(): GpuSpec | undefined {
  return GPUS.filter((g) => g.availability === "new" && g.price).sort((a, b) => a.price! - b.price!)[0];
}

/** Nouvelle carte mère : tous les SSD NVMe actuels (et ceux du plan) trouvent-ils un emplacement M.2 ? */
export function storageMigration(p: Profile, board: BoardSpec, extraNvme: number): Check {
  const nvme = p.m2Used + extraNvme;
  if (nvme > board.m2Slots) {
    return {
      label: "Stockage (migration)",
      status: "warn",
      detail: `La nouvelle carte mère a ${board.m2Slots} emplacement${board.m2Slots > 1 ? "s" : ""} M.2 pour ${nvme} SSD NVMe : il faudra un adaptateur PCIe (≈ 15 €) ou un boîtier USB pour l'un d'eux.`,
    };
  }
  return {
    label: "Stockage (migration)",
    status: "ok",
    detail: `${nvme === 1 ? `Ton SSD NVMe se rebranche sur l'un des ${board.m2Slots} emplacements M.2` : nvme > 1 ? `Tes ${nvme} SSD NVMe se rebranchent sur les ${board.m2Slots} emplacements M.2` : `${board.m2Slots} emplacements M.2 disponibles`} ; les disques SATA se rebranchent tels quels. Windows démarre en général sans réinstallation.`,
  };
}

/** Le ventirad ajouté rentre-t-il dans le boîtier ? */
export function coolerFit(p: Profile, cooler: CoolerSpec): Check {
  if (cooler.radiatorMm) {
    return { label: "Encombrement du ventirad", status: "warn", detail: `Radiateur de ${cooler.radiatorMm} mm : ton boîtier doit avoir un emplacement ${cooler.radiatorMm} mm en façade ou au plafond.` };
  }
  const h = cooler.heightMm ?? 155;
  if (p.caseSmall) return { label: "Hauteur du ventirad", status: "warn", detail: `Ventirad de ${h} mm de haut : les petits boîtiers acceptent souvent 130 à 150 mm. Vérifie la fiche de ton boîtier, sinon choisis un ventirad bas profil.` };
  if (!p.caseKnown) return { label: "Hauteur du ventirad", status: "warn", detail: `Ventirad de ${h} mm de haut : la plupart des boîtiers moyen tour l'acceptent (≥ 160 mm), vérifie la fiche du tien.` };
  return { label: "Hauteur du ventirad", status: "ok", detail: `${h} mm de haut : rentre dans un boîtier moyen ou grand tour.` };
}

/** Câble d'alimentation du processeur (EPS 8 broches), absent ou unique sur les vieilles alims. */
export function epsCable(p: Profile, c: CpuSpec, psuReplaced: boolean): Check {
  if (psuReplaced) return { label: "Câble processeur", status: "ok", detail: "La nouvelle alimentation a les câbles processeur 8 broches (EPS) nécessaires." };
  if (c.powerW >= 180 && !p.psuKnown) {
    return { label: "Câble processeur", status: "warn", detail: `Ce processeur peut consommer ≈ ${c.powerW} W : ton alim doit avoir un câble processeur 8 broches (EPS 4+4). Les très vieilles alims n'ont qu'un 4 broches.` };
  }
  return { label: "Câble processeur", status: "ok", detail: "Le câble processeur 8 broches (EPS) de ton alimentation suffit." };
}

/** Épaisseur des grosses cartes graphiques (2,5 à 3 emplacements). */
export function gpuThickness(p: Profile, g: GpuSpec): Check | undefined {
  if (g.tbp < 220) return undefined;
  if (p.caseSmall || p.formFactor === "mATX" || p.formFactor === "ITX") {
    return { label: "Épaisseur", status: "warn", detail: "Carte épaisse (≈ 2,5 à 3 emplacements) : en micro-ATX ou en petit boîtier, elle peut masquer un port PCIe ou gêner l'alimentation. Vérifie la place sous la carte." };
  }
  return { label: "Épaisseur", status: "ok", detail: "Carte de ≈ 2,5 à 3 emplacements : standard dans un boîtier moyen tour avec une carte mère ATX." };
}

/** Les ventirads se fixent de la même façon entre ces sockets. */
function sameMounting(a?: Socket, b?: Socket) {
  if (!a || !b) return false;
  if (a === b) return true;
  const groups: Socket[][] = [["AM4", "AM5"], ["LGA1700", "LGA1851"], ["LGA1150", "LGA1151", "LGA1200"]];
  return groups.some((g) => g.includes(a) && g.includes(b));
}

/** Familles de BIOS d'un processeur, de la plus précise à la plus générale (ex. 5800X3D → zen3-x3d, puis zen3). */
function biosFamilies(c: CpuSpec): BiosFamily[] {
  const x3d = /x3d/i.test(c.name);
  const apu = /\d{4}G\b/i.test(c.name);
  switch (c.gen) {
    // Les X3D ont leur propre BIOS minimum (souvent plus récent) : pas de repli sur la famille générale.
    case "amd-zen3": return /5700x3d/i.test(c.name) ? ["amd-zen3-x3d-5700"] : x3d ? ["amd-zen3-x3d"] : ["amd-zen3"];
    case "amd-zen4": return apu ? ["amd-zen4-apu"] : ["amd-zen4"];
    case "amd-zen5": return x3d ? ["amd-zen5-x3d"] : ["amd-zen5"];
    case "intel-10": return [];
    default: return [c.gen as BiosFamily];
  }
}

const frDate = (iso?: string) => (iso && !Number.isNaN(Date.parse(iso)) ? new Date(iso).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) : "");

/**
 * BIOS nécessaire pour un processeur sur la carte mère actuelle.
 * - carte connue : on compare la date du BIOS installé à celle du premier BIOS qui accepte ce processeur ;
 * - sinon : règle du chipset (mise à jour conseillée par prudence).
 */
function biosCheck(p: Profile, c: CpuSpec): Check | undefined {
  const fams = biosFamilies(c);
  const known = p.board?.biosMin ? fams.map((f) => [f, p.board!.biosMin![f]] as const).find(([, v]) => v !== undefined) : undefined;
  const flash = p.board?.biosFlashback
    ? " Ta carte peut se mettre à jour sans processeur (bouton dédié)."
    : " Fais-le avec ton processeur actuel, avant le changement : sans ce BIOS, le nouveau processeur ne démarrera pas.";
  if (known) {
    const min = known[1] as { version: string; date: string } | null;
    if (min === null) return { label: "BIOS", status: "fail", detail: `Le fabricant de ta carte mère ne prend pas en charge ce processeur, même avec le dernier BIOS.` };
    const installed = p.biosDate ? Date.parse(p.biosDate) : NaN;
    const minDate = Date.parse(min.date);
    // Les Ryzen 5000 sortis après les premiers (5500, 5600, 5700X…) demandent souvent un BIOS plus récent que le minimum « Ryzen 5000 ».
    const lateZen3 = c.gen === "amd-zen3" && !/x3d/i.test(c.name) && /ryzen \d (5500|5600(?!x)|5700x)\b/i.test(c.name);
    if (!Number.isNaN(installed) && !Number.isNaN(minDate) && installed >= minDate) {
      return lateZen3
        ? { label: "BIOS", status: "warn", detail: `Ton BIOS (${p.biosVersion ?? "installé"}, ${frDate(p.biosDate)}) prend en charge les premiers Ryzen 5000, mais ce modèle, sorti plus tard, demande parfois un BIOS plus récent : vérifie sa ligne dans la liste des processeurs compatibles de ta carte.` }
        : { label: "BIOS", status: "ok", detail: `Ton BIOS (${p.biosVersion ?? "installé"}, ${frDate(p.biosDate)}) prend déjà en charge ce processeur (version ${min.version} ou plus récente, d'après le fabricant).` };
    }
    return {
      label: "BIOS",
      status: "warn",
      detail: `Il faut le BIOS ${min.version}${frDate(min.date) ? ` (${frDate(min.date)})` : ""} ou plus récent${lateZen3 ? " (voire plus récent pour ce modèle)" : ""}${p.biosVersion ? `, tu as le ${p.biosVersion}${p.biosDate ? ` (${frDate(p.biosDate)})` : ""}` : ""}.${flash}`,
    };
  }
  if (p.chipset?.biosUpdateFor?.includes(c.gen)) {
    return { label: "BIOS", status: "warn", detail: `Une mise à jour du BIOS est probablement nécessaire${p.biosVersion ? ` (tu as le ${p.biosVersion}${p.biosDate ? `, ${frDate(p.biosDate)}` : ""})` : ""} : vérifie la version minimale dans la liste des processeurs compatibles de ta carte mère.${flash}` };
  }
  return undefined;
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
      const bios = biosCheck(p, c);
      if (bios) checks.push(bios);
      if (c.ramMaxMts.DDR4 && p.ramMts && c.ramMaxMts.DDR4 > p.ramMts && p.ramPlatformMaxMts && p.ramPlatformMaxMts < c.ramMaxMts.DDR4) {
        notes.push(`Avec ce processeur, ta carte mère autorise la RAM jusqu'à ${c.ramMaxMts.DDR4} MT/s.`);
      }
    } else {
      // Changement de plateforme : carte mère, puis RAM, puis ventirad.
      const plan = platformFor(c, p);
      if (!plan) continue;
      const { board, ram } = plan;
      // La nouvelle carte mère fait partie de la proposition : le point est « réglé », pas un problème restant.
      checks.push({
        label: "Carte mère",
        status: "fixed",
        detail: `${c.socket !== p.socket
          ? `Ce processeur utilise le socket ${c.socket}, ta carte mère est en ${p.socket ?? "?"}`
          : `Ton chipset ${p.chipset?.chipset ?? ""} ne supporte pas cette génération de processeur`} : une carte mère compatible est incluse.`,
      });
      additions.push({ role: "required", part: board, quantity: 1, reason: `Carte mère ${board.chipset} ${board.formFactor} compatible. ${board.note ?? ""}`.trim(), models: recommendBoards(board, c, p) });
      if (ram) {
        checks.push({ label: "Mémoire vive", status: "fixed", detail: `La nouvelle carte mère utilise de la ${board.ramType}, ta RAM ${p.ramType ?? ""} n'est pas compatible : un kit ${board.ramType} est inclus.` });
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
      checks.push(storageMigration(p, board, 0));
    }

    // Sortie vidéo : un processeur sans puce graphique (F, KF, la plupart des Ryzen AM4) a besoin d'une carte graphique.
    let gpuAfter = p.gpu;
    if (!c.igpu && (!p.gpu || p.gpu.integrated)) {
      const g = cheapestGpu();
      checks.push({
        label: "Sortie vidéo",
        status: "fail",
        detail: "Ce processeur n'a pas de puce graphique et ton PC n'a pas de carte graphique : sans en ajouter une, l'écran resterait noir.",
      });
      if (g) {
        additions.push({ role: "required", part: g, quantity: 1, reason: "Pour avoir une image : ce processeur n'a pas de puce graphique intégrée." });
        gpuAfter = g;
      }
    } else if (!c.igpu) {
      checks.push({ label: "Sortie vidéo", status: "ok", detail: "Ce processeur n'a pas de puce graphique : l'image passe par ta carte graphique, comme aujourd'hui." });
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
    const newCooler = additions.find((a) => a.part.kind === "cooler")?.part;
    if (newCooler?.kind === "cooler") checks.push(coolerFit(p, newCooler));

    // Alimentation avec la carte graphique (actuelle, ou ajoutée pour la sortie vidéo)
    checkPower(p, c.powerW, gpuAfter, checks, additions, gpuAfter === p.gpu ? "avec ta carte graphique actuelle" : "avec la carte graphique ajoutée");
    checks.push(epsCable(p, c, additions.some((a) => a.part.kind === "psu" && a.role === "required")));

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
  // Génération du prochain emplacement M.2 libre, quand on connaît la carte (ex. [4, 3] : le 2e est en PCIe 3.0).
  const nextM2Gen = p.board?.m2Gens?.[p.m2Used];
  const gen = nextM2Gen ?? p.pcieGen ?? 3;
  // Partages de lignes connus pour cette carte (M.2 ↔ SATA, M.2 ↔ port PCIe).
  const m2Sharing = relevantSharing(p).filter((s) => /m\.?2|m2/i.test(s));

  for (const s of SSDS) {
    const checks: Check[] = [];
    const notes: string[] = [];
    if (p.isLaptop) {
      checks.push({
        label: "PC portable",
        status: "warn",
        detail: s.iface === "HDD"
          ? "Un disque dur 3,5 pouces ne rentre pas dans un PC portable : prends plutôt un disque externe USB."
          : s.iface === "SATA"
          ? "Seulement si ton portable a un emplacement 2,5 pouces (de moins en moins courant) : vérifie la fiche de ton modèle."
          : "Les portables n'ont souvent qu'un emplacement M.2 : tu remplaces alors ton SSD actuel (clonage du disque à prévoir).",
      });
    }
    if (s.iface === "HDD") {
      if (p.isLaptop) continue;
      checks.push({ label: "Branchement", status: "ok", detail: "Port SATA + câble SATA + câble d'alimentation SATA, et un emplacement 3,5 pouces libre dans le boîtier (vérifie : les boîtiers récents n'en ont parfois qu'un ou deux)." });
      notes.push("Un disque dur est 30 à 50 fois plus lent qu'un SSD pour ouvrir des fichiers : idéal pour stocker photos, vidéos et sauvegardes, pas pour Windows ni les jeux.");
    } else if (s.iface === "SATA") {
      checks.push({ label: "Branchement", status: "ok", detail: "Port SATA + câble SATA (souvent fourni avec la carte mère) + câble d'alimentation SATA." });
      if (m2Free && m2Free > 0) notes.push("Un SSD NVMe est 3 à 6 fois plus rapide pour un prix proche : préfère-le si tu as un emplacement M.2 libre.");
    } else {
      if (m2Free == null) {
        checks.push({ label: "Emplacement M.2", status: "warn", detail: "Carte mère non répertoriée : vérifie qu'il reste un emplacement M.2 libre." });
      } else if (m2Free <= 0) {
        continue; // pas de place : seules les options SATA restent proposées
      } else {
        checks.push({
          label: "Emplacement M.2",
          status: m2Sharing.length ? "warn" : "ok",
          detail: `${m2Free} emplacement${m2Free > 1 ? "s" : ""} M.2 libre${m2Free > 1 ? "s" : ""} sur ${p.m2Total}${nextM2Gen ? ` (le prochain en PCIe ${nextM2Gen}.0)` : ""}.${m2Sharing.length ? ` À savoir sur ta carte mère : ${m2Sharing.join(" ")}` : ""}`,
        });
      }
      if (s.iface === "NVMe5") {
        // Le PCIe 5.0 n'a d'intérêt que sur un emplacement PCIe 5.0 : ailleurs, il coûte plus cher pour la même vitesse.
        if (gen < 5) {
          checks.push({ label: "Vitesse", status: "warn", detail: `Ton emplacement M.2 est en PCIe ${gen}.0 : ce SSD y fonctionne, mais limité à ≈ ${gen === 4 ? "7 000" : "3 500"} Mo/s. Un SSD PCIe 4.0 fait la même chose pour moins cher.` });
        } else {
          checks.push({ label: "Vitesse", status: "ok", detail: "≈ 12 000 Mo/s sur ton emplacement PCIe 5.0. Il chauffe : utilise le dissipateur de la carte mère." });
        }
        notes.push("En jeu, un SSD PCIe 5.0 ne charge pas visiblement plus vite qu'un PCIe 4.0 : il sert surtout aux gros transferts de fichiers.");
      } else if (s.iface === "NVMe4" && gen < 4) {
        checks.push({ label: "Vitesse", status: "ok", detail: `SSD PCIe 4.0 sur ${nextM2Gen ? "un emplacement" : "ta plateforme"} PCIe 3.0 : il fonctionne, limité à ≈ 3 500 Mo/s. Inutile de payer plus cher pour un modèle haut de gamme.` });
      } else {
        checks.push({ label: "Vitesse", status: "ok", detail: s.iface === "NVMe3" ? "≈ 3 500 Mo/s, la pleine vitesse de ton port." : "≈ 7 000 Mo/s." });
      }
      if (!p.board?.sharing) notes.push("Sur certaines cartes mères, le 2e emplacement M.2 désactive 1 ou 2 ports SATA : voir le manuel.");
    }
    out.push(finalize({
      id: `ssd-${s.id}`, category: "storage", title: s.name, main: s, mainQuantity: 1,
      gainLabel: s.tb < 1 ? `+${s.tb * 1000} Go` : `+${s.tb} To`, checks, additions: [], notes,
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
  const cpu = proposeCpus(p);
  return { gpu: proposeGpus(p, cpu), cpu, board: proposeBoards(cpu), ram: proposeRam(p), storage: proposeStorage(p) };
}

// ---------------------------------------------------------------------------
// Cartes mères : modèles réels conseillés et changements de plateforme
// ---------------------------------------------------------------------------

/**
 * 2 ou 3 modèles réels de la base pour une carte générique (même chipset, même format, même type de RAM),
 * un par fabricant. On privilégie, dans l'ordre :
 * - la mise à jour du BIOS sans processeur (indispensable si le BIOS d'usine est trop ancien pour le processeur) ;
 * - un BIOS documenté pour ce processeur ;
 * - assez d'emplacements M.2 pour les SSD actuels, puis le port graphique en PCIe 5.0.
 */
export function recommendBoards(generic: BoardSpec, cpu: CpuSpec | undefined, p: Profile): ModelPick[] {
  const fams = cpu ? biosFamilies(cpu) : [];
  const candidates = KNOWN_BOARDS.filter(
    (b) => (b.chipset === generic.chipset || b.chipset === `${generic.chipset}E`) && b.formFactor === generic.formFactor && b.ramType === generic.ramType,
  );
  const scored = candidates.map((b) => {
    const bios = fams.map((f) => b.biosMin?.[f]).find((v) => v !== undefined);
    const m2 = b.m2Slots || 0;
    let score = 0;
    if (b.biosFlashback) score += 4;
    if (bios) score += 2;
    if (m2 > p.m2Used) score += 2;
    score += Math.min(m2, 4) * 0.5;
    if (b.pcieGpu === 5) score += 1;
    const why: string[] = [];
    if (m2) why.push(`${m2} emplacement${m2 > 1 ? "s" : ""} M.2${b.m2Gens?.includes(5) ? " dont un en PCIe 5.0" : ""}`);
    if (b.pcieGpu === 5) why.push("port graphique PCIe 5.0");
    if (b.biosFlashback) why.push("BIOS à jour sans processeur");
    if (/wifi|\bax\b/i.test(b.name)) why.push("Wi-Fi intégré");
    if (b.sata) why.push(`${b.sata} ports SATA`);
    return { b, score, why };
  });
  const out: ModelPick[] = [];
  const vendors = new Set<string>();
  for (const s of scored.sort((x, y) => y.score - x.score)) {
    const vendor = s.b.name.split(" ")[0].toLowerCase();
    if (vendors.has(vendor)) continue;
    vendors.add(vendor);
    out.push({ name: s.b.name, why: s.why, url: s.b.source });
    if (out.length === 3) break;
  }
  return out;
}

/**
 * Onglet « Carte mère » : un changement de plateforme par carte possible, avec le processeur le moins cher
 * qui apporte un vrai gain, et les autres processeurs compatibles en note.
 */
export function proposeBoards(cpuProposals: Proposal[]): Proposal[] {
  const groups = new Map<string, Proposal[]>();
  for (const prop of cpuProposals) {
    const board = prop.additions.find((a) => a.role === "required" && a.part.kind === "board");
    if (!board) continue;
    const list = groups.get(board.part.id) ?? [];
    list.push(prop);
    groups.set(board.part.id, list);
  }
  const out: Proposal[] = [];
  for (const props of groups.values()) {
    const sorted = [...props].sort((a, b) => a.total - b.total);
    const first = sorted[0];
    const boardAdd = first.additions.find((a) => a.part.kind === "board")!;
    const board = boardAdd.part as BoardSpec;
    const cpu = first.main as CpuSpec;
    const others = sorted.slice(1, 4).map((x) => `${(x.main as CpuSpec).name.replace(/^(AMD|Intel) /, "")} (${x.total} € au total)`);
    out.push(
      finalize({
        id: `board-${board.id}`,
        category: "board",
        title: `Passer en ${board.socket} : ${board.name.replace(/^Carte mère /, "")}`,
        main: board,
        mainQuantity: 1,
        gainLabel: first.gainLabel,
        gainPercent: first.gainPercent,
        highlight: undefined,
        checks: first.checks,
        additions: [
          { role: "required", part: cpu, quantity: 1, reason: `Le processeur le moins cher qui apporte un vrai gain sur cette plateforme.` },
          ...first.additions.filter((a) => a.part.kind !== "board"),
        ],
        mainModels: boardAdd.models,
        notes: [
          ...(others.length ? [`Autres processeurs possibles sur cette carte : ${others.join(", ")}.`] : []),
          board.socket === "AM5" ? "Le socket AM5 est prévu pour les prochaines générations de Ryzen : tu pourras changer de processeur plus tard sans changer de carte." : "",
          board.socket === "LGA1700" ? "Le socket LGA1700 est en fin de série : pas de nouveau processeur Intel prévu dessus." : "",
        ].filter(Boolean),
      }),
    );

  }
  return out.sort((a, b) => a.total - b.total);
}
