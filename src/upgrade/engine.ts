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
import { BOARDS, CASES, COOLERS, CPUS, FAN_KITS, GPUS, PSUS, RAM_KITS, SSDS, CHIPSETS, catalogText } from "./catalog";
import { KNOWN_BOARDS, sharingText } from "./boards";
import { currentLang, tr } from "../settings";

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
// Fonction (et non constante) : les textes sont traduits au moment de l'appel, dans la langue choisie.
const PSU_MODELS = (id: string): ModelPick[] | undefined => {
  const corsair = (w: number, ref: string): ModelPick => ({
    name: tr(`Corsair RM${w}e (modèle 2025, réf. ${ref})`, `Corsair RM${w}e (2025 model, ref. ${ref})`),
    why: ["80+ Gold", "ATX 3.1", tr("câble 12V-2x6 natif", "native 12V-2x6 cable")],
  });
  const models: Record<string, ModelPick[]> = {
    "psu-650": [corsair(650, "CP-9020302")],
    "psu-750": [corsair(750, "CP-9020295")],
    "psu-850": [
      corsair(850, "CP-9020296"),
      { name: "MSI MAG A850GL PCIE5", why: ["80+ Gold", tr("1 connecteur 16 broches + 4 × 8 broches", "1 × 16-pin connector + 4 × 8-pin")], url: "https://www.msi.com/Power-Supply/MAG-A850GL-PCIE5/Specification" },
    ],
    "psu-1000": [corsair(1000, "CP-9020297")],
  };
  return models[id];
};

export function checkPower(p: Profile, cpuPowerW: number | undefined, gpu: GpuSpec | undefined, checks: Check[], additions: Addition[], cause: string) {
  const label = tr("Alimentation", "Power supply");
  if (!gpu) {
    checks.push({ label, status: "warn", detail: tr("Carte graphique actuelle non reconnue : vérifie que ton alimentation suffit.", "Current graphics card not recognized: check that your power supply is powerful enough.") });
    return;
  }
  const need = psuNeed(cpuPowerW, gpu);
  const real = psuNeedReal(cpuPowerW, gpu);
  const needs16 = gpu.power === "12V-2x6";
  // « cause » arrive déjà traduit par l'appelant.
  if (p.psuKnown) {
    if (p.psuWatts >= need) {
      checks.push({ label, status: "ok", detail: tr(`${need} W conseillés, ton alimentation fait ${p.psuWatts} W.`, `${need} W recommended, your power supply is ${p.psuWatts} W.`) });
    } else if (p.psuWatts >= real) {
      // Le calcul réel passe, seule la marge très prudente du fabricant n'est pas atteinte.
      const psu = cheapestPsu(need, needs16, pcie8Needed(gpu));
      const draw = Math.round(real / 1.3 / 10) * 10;
      checks.push({ label, status: "warn", detail: tr(`Ta config consommera ≈ ${draw} W en jeu : tes ${p.psuWatts} W suffisent si ton alim est de bonne qualité (80+ Bronze ou mieux, moins de 6-7 ans). Le fabricant conseille ${need} W par prudence.`, `Your setup will draw ≈ ${draw} W while gaming: your ${p.psuWatts} W is enough if your power supply is good quality (80+ Bronze or better, less than 6-7 years old). The manufacturer recommends ${need} W to be safe.`) });
      if (psu) additions.push({ role: "recommended", part: psu, quantity: 1, models: PSU_MODELS(psu.id), reason: tr(`Si ton alimentation est d'entrée de gamme ou ancienne (${need} W conseillés par le fabricant).`, `If your power supply is entry-level or old (${need} W recommended by the manufacturer).`) });
    } else {
      const psu = cheapestPsu(need, needs16, pcie8Needed(gpu));
      checks.push({ label, status: "fail", detail: tr(`${need} W conseillés ${cause}, ton alimentation ne fait que ${p.psuWatts} W.`, `${need} W recommended ${cause}, your power supply is only ${p.psuWatts} W.`) });
      if (psu) additions.push({ role: "required", part: psu, quantity: 1, models: PSU_MODELS(psu.id), reason: tr(`Ton alimentation de ${p.psuWatts} W est trop juste (${need} W conseillés).`, `Your ${p.psuWatts} W power supply is too weak (${need} W recommended).`) });
    }
  } else if (p.psuWatts >= need) {
    checks.push({ label, status: "warn", detail: tr(`${need} W conseillés. Ta config actuelle laisse supposer au moins ${p.psuWatts} W : confirme en lisant l'étiquette de l'alim.`, `${need} W recommended. Your current setup suggests at least ${p.psuWatts} W: check the label on your power supply to confirm.`) });
  } else if (p.psuWatts >= real) {
    checks.push({ label, status: "warn", detail: tr(`${need} W conseillés par le fabricant, ≈ ${real} W suffisent d'après la consommation réelle. Ton alim n'est pas renseignée : lis son étiquette.`, `${need} W recommended by the manufacturer, ≈ ${real} W is enough based on actual power draw. Your power supply isn't specified: read its label.`) });
  } else {
    const psu = cheapestPsu(need, needs16, pcie8Needed(gpu));
    checks.push({ label, status: "warn", detail: tr(`${need} W conseillés ${cause}. Ton alimentation n'est pas renseignée : vu ta carte actuelle, elle fait peut-être moins (≈ ${p.psuWatts} W supposés).`, `${need} W recommended ${cause}. Your power supply isn't specified: given your current graphics card, it may be less powerful (≈ ${p.psuWatts} W assumed).`) });
    if (psu) additions.push({ role: "verify", part: psu, quantity: 1, models: PSU_MODELS(psu.id), reason: tr(`Nécessaire si ton alimentation fait moins de ${need} W (lis l'étiquette sur son flanc).`, `Needed if your power supply is under ${need} W (read the label on its side).`) });
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
    const pcieLabel = tr("Port PCIe", "PCIe slot");
    if (g.pcieLanes === 4 && p.pcieGen === 3) {
      checks.push({ label: pcieLabel, status: "warn", detail: tr("Cette carte n'utilise que 4 lignes PCIe : sur ton port PCIe 3.0, elle perd 10 à 25 %. Une carte en x16 est préférable.", "This card only uses 4 PCIe lanes: in your PCIe 3.0 slot, it loses 10 to 25%. An x16 card is a better choice.") });
    } else if (g.pcieLanes === 8 && p.pcieGen === 3) {
      checks.push({ label: pcieLabel, status: "warn", detail: tr("Cette carte n'utilise que 8 lignes PCIe. Sur ton port PCIe 3.0, elle perd environ 5 à 10 % (davantage si sa mémoire vidéo sature).", "This card only uses 8 PCIe lanes. In your PCIe 3.0 slot, it loses about 5 to 10% (more if its video memory fills up).") });
    } else if (p.pcieGen) {
      checks.push({ label: pcieLabel, status: "ok", detail: tr(`Fonctionne sur ton port PCIe ${p.pcieGen}.0 x16${p.pcieGen < 4 ? " avec une perte négligeable (1 à 3 %)" : ""}.`, `Works in your PCIe ${p.pcieGen}.0 x16 slot${p.pcieGen < 4 ? " with a negligible loss (1 to 3%)" : ""}.`) });
    } else {
      checks.push({ label: pcieLabel, status: "ok", detail: tr("Toute carte mère avec un port PCIe x16 convient.", "Any motherboard with a PCIe x16 slot will do.") });
    }
    // Ryzen 8000G : le processeur ne donne que 8 lignes PCIe à la carte graphique (4 pour les 8500G / 8300G).
    const apu = p.cpu?.name.match(/ryzen \d (8\d)00g/i);
    if (apu) {
      const lanes = /8[53]00g/i.test(p.cpu!.name) ? 4 : 8;
      const last = checks[checks.length - 1];
      checks[checks.length - 1] = {
        ...last,
        status: lanes === 4 ? "warn" : last.status,
        detail: tr(
          `${last.detail} Ton ${p.cpuDisplay} ne donne que ${lanes} lignes PCIe 4.0 à la carte graphique : perte ${lanes === 4 ? "sensible (10 % ou plus) avec une carte puissante" : "faible (quelques %)"}.`,
          `${last.detail} Your ${p.cpuDisplay} only gives the graphics card ${lanes} PCIe 4.0 lanes: ${lanes === 4 ? "a noticeable loss (10% or more) with a powerful card" : "a small loss (a few %)"}.`,
        ),
      };
    }
    // Partage du port graphique sur ta carte (ex. « utiliser le M2_2 fait passer le port en x8 »).
    // Le tri se fait sur le texte français des notes (board.sharing), l'affichage passe par sharingText().
    const gpuSharing = relevantSharing(p).filter((s) => /carte graphique/i.test(s));
    if (gpuSharing.length) {
      const last = checks[checks.length - 1];
      const notesText = gpuSharing.map(sharingText).join(" ");
      checks[checks.length - 1] = { ...last, detail: tr(`${last.detail} À savoir sur ta carte mère : ${notesText}`, `${last.detail} Good to know about your motherboard: ${notesText}`) };
    }

    // PC de marque : boîtier, alimentation et carte mère souvent propriétaires.
    if (p.isOem) {
      checks.push({
        label: tr("PC de marque", "Prebuilt PC"),
        status: "warn",
        detail: tr(
          `Les PC ${p.manufacturer ?? "de marque"} ont souvent une alimentation propriétaire (180 à 300 W, sans câble PCIe) et un boîtier compact. Vérifie la fiche de ton modèle : une alimentation standard peut ne pas rentrer.`,
          `${p.manufacturer ? `${p.manufacturer} PCs` : "Prebuilt PCs"} often have a proprietary power supply (180 to 300 W, no PCIe cable) and a compact case. Check your model's spec sheet: a standard power supply may not fit.`,
        ),
      });
    }

    // 2. Alimentation (puissance)
    checkPower(p, p.cpu?.powerW, g, checks, additions, tr("pour cette carte", "for this card"));
    const newPsu = additions.find((a) => a.part.kind === "psu");
    const psuReplaced = newPsu?.role === "required";
    const newPsuW = newPsu && "watts" in newPsu.part ? newPsu.part.watts : "";
    const ifNewPsu = newPsu?.role === "verify" ? tr(` Si tu changes d'alimentation, celle proposée (${newPsuW} W) les a.`, ` If you change your power supply, the suggested one (${newPsuW} W) has them.`) : "";

    // 3. Connecteurs d'alimentation
    const cablesLabel = tr("Câbles PCIe", "PCIe cables");
    const newPsuHas = tr(" : la nouvelle alimentation les a.", ": the new power supply has them.");
    const checkYours = tr(". Vérifie que ton alim les a.", ". Check that your power supply has them.");
    if (g.power === "12V-2x6") {
      const label16 = tr("Connecteur 16 broches", "16-pin connector");
      if (psuReplaced || p.psu12v2x6) {
        checks.push({ label: label16, status: "ok", detail: psuReplaced ? tr("La nouvelle alimentation a le câble 12V-2x6 natif.", "The new power supply has the native 12V-2x6 cable.") : tr("Ton alimentation a un câble 12V-2x6 natif.", "Your power supply has a native 12V-2x6 cable.") });
      } else {
        const n = pcie8ViaAdapter(g);
        checks.push({
          label: label16, status: "warn",
          detail: tr(
            `La carte utilise un connecteur 12V-2x6. Un adaptateur est fourni : il faut ${n} câbles PCIe 8 broches séparés sur ton alim (pas un câble dédoublé).${ifNewPsu ? ` Si tu changes d'alimentation, celle proposée a le câble natif.` : ""}`,
            `The card uses a 12V-2x6 connector. An adapter is included: you need ${n} separate 8-pin PCIe cables from your power supply (not one split cable).${ifNewPsu ? ` If you change your power supply, the suggested one has the native cable.` : ""}`,
          ),
        });
      }
    } else if (g.power === "8+6") {
      checks.push({ label: cablesLabel, status: psuReplaced ? "ok" : "warn", detail: tr(`Il faut un câble PCIe 8 broches et un câble 6 broches (un câble « 6+2 » convient)${psuReplaced ? newPsuHas : `${checkYours}${ifNewPsu}`}`, `You need one 8-pin and one 6-pin PCIe cable (a "6+2" cable works)${psuReplaced ? newPsuHas : `${checkYours}${ifNewPsu}`}`) });
    } else if (g.power === "2x8" || g.power === "3x8") {
      checks.push({ label: cablesLabel, status: psuReplaced ? "ok" : "warn", detail: tr(`Il faut ${pcie8Needed(g)} câbles PCIe 8 broches séparés${psuReplaced ? newPsuHas : `${checkYours}${ifNewPsu}`}`, `You need ${pcie8Needed(g)} separate 8-pin PCIe cables${psuReplaced ? newPsuHas : `${checkYours}${ifNewPsu}`}`) });
    } else if (g.power === "1x8") {
      const curNeeds = cur?.power;
      checks.push({
        label: cablesLabel,
        status: "ok",
        detail: curNeeds && curNeeds !== "none" && curNeeds !== "1x6" ? tr("1 câble PCIe 8 broches, comme ta carte actuelle.", "1 × 8-pin PCIe cable, like your current card.") : tr("1 câble PCIe 8 broches : présent sur toutes les alimentations de PC de jeu.", "1 × 8-pin PCIe cable: found on every gaming PC power supply."),
      });
    } else {
      checks.push({ label: cablesLabel, status: "ok", detail: g.power === "none" ? tr("Aucun câble : la carte est alimentée par le port PCIe.", "No cable: the card is powered through the PCIe slot.") : tr("1 câble PCIe 6 broches.", "1 × 6-pin PCIe cable.") });
    }
    // Branchement différent selon le modèle partenaire : on le signale, sans changer le verdict.
    if (g.powerNote) {
      const last = checks[checks.length - 1];
      checks[checks.length - 1] = { ...last, detail: `${last.detail} ${catalogText(g.powerNote)}` };
    }

    // 4. Place dans le boîtier
    // Les longueurs varient beaucoup selon le modèle (ex. RTX 5070 : de 229 à 338 mm). On compare aux modèles
    // les plus longs quand on les connaît ; sinon, une marge de 30 mm sous la longueur typique reste « à vérifier ».
    const longest = g.lengthMaxMm ?? g.lengthMm + 30;
    const fitLabel = tr("Place dans le boîtier", "Room in the case");
    if (p.gpuMaxMm != null) {
      if (longest <= p.gpuMaxMm) {
        checks.push({ label: fitLabel, status: "ok", detail: tr(`${g.lengthMaxMm ? `Jusqu'à ${g.lengthMaxMm} mm pour les modèles les plus longs` : `≈ ${g.lengthMm} mm`}, ton boîtier accepte jusqu'à ${p.gpuMaxMm} mm.`, `${g.lengthMaxMm ? `Up to ${g.lengthMaxMm} mm for the longest models` : `≈ ${g.lengthMm} mm`}, your case takes up to ${p.gpuMaxMm} mm.`) });
      } else if (g.lengthMm <= p.gpuMaxMm) {
        checks.push({
          label: fitLabel,
          status: "warn",
          detail: tr(
            `Ton boîtier accepte ${p.gpuMaxMm} mm : la plupart des modèles (≈ ${g.lengthMm} mm) rentrent, mais pas les plus longs${g.lengthMaxMm ? ` (jusqu'à ${g.lengthMaxMm} mm)` : ""}. Vérifie la longueur du modèle exact sur sa fiche (compte 15 à 20 mm de marge pour les câbles).`,
            `Your case takes ${p.gpuMaxMm} mm: most models (≈ ${g.lengthMm} mm) fit, but not the longest ones${g.lengthMaxMm ? ` (up to ${g.lengthMaxMm} mm)` : ""}. Check the exact model's length on its spec sheet (allow 15 to 20 mm of room for the cables).`,
          ),
        });
      } else {
        const box = CASES.filter((c) => c.maxGpuMm >= g.lengthMm && (!p.formFactor || c.formFactors.includes(p.formFactor))).sort((a, b) => a.price - b.price)[0];
        checks.push({ label: fitLabel, status: "fail", detail: tr(`Les modèles courants mesurent ≈ ${g.lengthMm} mm, ton boîtier n'accepte que ${p.gpuMaxMm} mm.`, `Typical models are ≈ ${g.lengthMm} mm long, your case only takes ${p.gpuMaxMm} mm.`) });
        if (box) additions.push({ role: "required", part: box, quantity: 1, reason: tr(`Pour loger une carte de ${g.lengthMm} mm. Alternative : chercher un modèle compact de cette carte (moins de ${p.gpuMaxMm} mm).`, `To fit a ${g.lengthMm} mm card. Alternative: look for a compact model of this card (under ${p.gpuMaxMm} mm).`) });
      }
    } else {
      checks.push({
        label: fitLabel,
        status: "warn",
        detail: tr(
          `Les modèles courants mesurent ≈ ${g.lengthMm} mm${g.lengthMaxMm ? `, jusqu'à ${g.lengthMaxMm} mm pour les plus longs` : ""} : vérifie la longueur max dans la fiche de ton boîtier.`,
          `Typical models are ≈ ${g.lengthMm} mm long${g.lengthMaxMm ? `, up to ${g.lengthMaxMm} mm for the longest` : ""}: check the maximum length on your case's spec sheet.`,
        ),
      });
    }

    // 5. Ventilation : la chaleur supplémentaire doit sortir du boîtier
    const newCase = additions.some((a) => a.part.kind === "case");
    const extraHeat = g.tbp - (cur?.tbp ?? 150);
    const airLabel = tr("Ventilation du boîtier", "Case airflow");
    if (!newCase && g.tbp >= 220) {
      const fans = p.caseFans;
      const kit = FAN_KITS[0];
      if (fans == null) {
        checks.push({ label: airLabel, status: "warn", detail: tr(`La carte dégage jusqu'à ${g.tbp} W. Il faut au moins 3 ventilateurs de boîtier (2 en façade, 1 à l'arrière).`, `The card puts out up to ${g.tbp} W of heat. You need at least 3 case fans (2 at the front, 1 at the back).`) });
        additions.push({ role: "verify", part: kit, quantity: 1, reason: tr("Si ton boîtier a moins de 3 ventilateurs.", "If your case has fewer than 3 fans.") });
      } else if (fans < 2 || (fans < 3 && g.tbp >= 280)) {
        checks.push({ label: airLabel, status: "fail", detail: tr(`${fans} ventilateur${fans > 1 ? "s" : ""} ne suffi${fans > 1 ? "sent" : "t"} pas pour évacuer ${g.tbp} W : la carte chaufferait et baisserait ses fréquences.`, `${fans} fan${fans === 1 ? " isn't" : "s aren't"} enough to remove ${g.tbp} W: the card would overheat and lower its clock speeds.`) });
        additions.push({ role: "required", part: kit, quantity: 1, reason: tr(`Pour évacuer ${extraHeat > 0 ? `${extraHeat} W de chaleur en plus` : "la chaleur de la carte"} (vise 2 en façade + 1 à l'arrière, au minimum).`, `To remove ${extraHeat > 0 ? `${extraHeat} W of extra heat` : "the card's heat"} (aim for 2 at the front + 1 at the back, at least).`) });
      } else if (fans < 3 && extraHeat >= 60) {
        checks.push({ label: airLabel, status: "warn", detail: tr(`${extraHeat} W de chaleur en plus : un 3e ventilateur améliorera les températures.`, `${extraHeat} W of extra heat: a 3rd fan will improve temperatures.`) });
        additions.push({ role: "recommended", part: kit, quantity: 1, reason: tr("Pour garder la carte au frais et silencieuse.", "To keep the card cool and quiet.") });
      } else {
        checks.push({ label: airLabel, status: "ok", detail: tr(`${fans >= 3 ? "3 ventilateurs ou plus" : `${fans} ventilateurs`} : suffisant pour ${g.tbp} W.`, `${fans >= 3 ? "3 fans or more" : `${fans} fans`}: enough for ${g.tbp} W.`) });
      }
    } else if (!newCase) {
      checks.push({ label: airLabel, status: "ok", detail: tr(`${g.tbp} W : une ventilation standard suffit.`, `${g.tbp} W: standard airflow is enough.`) });
    } else {
      const box = additions.find((a) => a.part.kind === "case")!.part;
      const boxFans = "fansIncluded" in box ? box.fansIncluded : 3;
      checks.push({ label: airLabel, status: "ok", detail: tr(`Le nouveau boîtier inclut ${boxFans} ventilateurs.`, `The new case comes with ${boxFans} fans.`) });
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
      const times = Math.round(effective / cur.perf);
      gainLabel = cur.integrated
        ? tr(`≈ ${times} fois plus rapide que les graphiques intégrés`, `≈ ${times} times faster than integrated graphics`)
        : tr(`≈ +${gainPercent} % en jeu (1440p)`, `≈ +${gainPercent}% in games (1440p)`);
      const balanceLabel = tr("Équilibre avec le processeur", "Balance with the processor");
      if (p.cpu && g.perf > ceiling * 1.05) {
        const used = Math.round((ceiling / g.perf) * 100);
        const full = Math.round((g.perf / cur.perf - 1) * 100);
        if (!cur.integrated) gainLabel = tr(`≈ +${gainPercent} % en jeu, plafonné par ton processeur (+${full} % avec un CPU plus récent)`, `≈ +${gainPercent}% in games, capped by your processor (+${full}% with a newer CPU)`);
        checks.push({ label: balanceLabel, status: "warn", detail: tr(`Ton ${p.cpuDisplay} limitera cette carte : tu profiteras d'environ ${used} % de sa puissance en 1440p (moins en 1080p).`, `Your ${p.cpuDisplay} will hold this card back: you'll get about ${used}% of its power at 1440p (less at 1080p).`) });
        pairing = pairCpu(g, used, cpuProposals);
        if (!pairing) notes.push(tr("Regarde l'onglet Processeur pour équilibrer la config.", "Check the Processor tab to balance your setup."));
      } else if (p.cpu) {
        checks.push({ label: balanceLabel, status: "ok", detail: tr(`Ton ${p.cpuDisplay} peut exploiter cette carte.`, `Your ${p.cpuDisplay} can make full use of this card.`) });
      }
    }

    if (g.vramGb <= 8) notes.push(tr("8 Go de mémoire vidéo devient juste en 1440p sur les jeux récents.", "8 GB of video memory is getting tight at 1440p in recent games."));

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
  const label = tr("Stockage (migration)", "Storage (migration)");
  if (nvme > board.m2Slots) {
    return {
      label,
      status: "warn",
      detail: tr(
        `La nouvelle carte mère a ${board.m2Slots} emplacement${board.m2Slots > 1 ? "s" : ""} M.2 pour ${nvme} SSD NVMe : il faudra un adaptateur PCIe (≈ 15 €) ou un boîtier USB pour l'un d'eux.`,
        `The new motherboard has ${board.m2Slots} M.2 slot${board.m2Slots > 1 ? "s" : ""} for ${nvme} NVMe SSDs: you'll need a PCIe adapter (≈ €15) or a USB enclosure for one of them.`,
      ),
    };
  }
  return {
    label,
    status: "ok",
    detail: tr(
      `${nvme === 1 ? `Ton SSD NVMe se rebranche sur l'un des ${board.m2Slots} emplacements M.2` : nvme > 1 ? `Tes ${nvme} SSD NVMe se rebranchent sur les ${board.m2Slots} emplacements M.2` : `${board.m2Slots} emplacements M.2 disponibles`} ; les disques SATA se rebranchent tels quels. Windows démarre en général sans réinstallation.`,
      `${nvme === 1 ? `Your NVMe SSD plugs into one of the ${board.m2Slots} M.2 slots` : nvme > 1 ? `Your ${nvme} NVMe SSDs plug into the ${board.m2Slots} M.2 slots` : `${board.m2Slots} M.2 slots available`}; SATA drives plug back in as they are. Windows usually starts without reinstalling.`,
    ),
  };
}

/** Le ventirad ajouté rentre-t-il dans le boîtier ? */
export function coolerFit(p: Profile, cooler: CoolerSpec): Check {
  if (cooler.radiatorMm) {
    return { label: tr("Encombrement du ventirad", "Cooler clearance"), status: "warn", detail: tr(`Radiateur de ${cooler.radiatorMm} mm : ton boîtier doit avoir un emplacement ${cooler.radiatorMm} mm en façade ou au plafond.`, `${cooler.radiatorMm} mm radiator: your case needs a ${cooler.radiatorMm} mm mount at the front or top.`) };
  }
  const h = cooler.heightMm ?? 155;
  const label = tr("Hauteur du ventirad", "Cooler height");
  if (p.caseSmall) return { label, status: "warn", detail: tr(`Ventirad de ${h} mm de haut : les petits boîtiers acceptent souvent 130 à 150 mm. Vérifie la fiche de ton boîtier, sinon choisis un ventirad bas profil.`, `${h} mm tall cooler: small cases often take 130 to 150 mm. Check your case's spec sheet, or else pick a low-profile cooler.`) };
  if (!p.caseKnown) return { label, status: "warn", detail: tr(`Ventirad de ${h} mm de haut : la plupart des boîtiers moyen tour l'acceptent (≥ 160 mm), vérifie la fiche du tien.`, `${h} mm tall cooler: most mid-tower cases take it (≥ 160 mm), check your case's spec sheet.`) };
  return { label, status: "ok", detail: tr(`${h} mm de haut : rentre dans un boîtier moyen ou grand tour.`, `${h} mm tall: fits in a mid or full tower case.`) };
}

/** Câble d'alimentation du processeur (EPS 8 broches), absent ou unique sur les vieilles alims. */
export function epsCable(p: Profile, c: CpuSpec, psuReplaced: boolean): Check {
  const label = tr("Câble processeur", "Processor cable");
  if (psuReplaced) return { label, status: "ok", detail: tr("La nouvelle alimentation a les câbles processeur 8 broches (EPS) nécessaires.", "The new power supply has the 8-pin processor (EPS) cables needed.") };
  if (c.powerW >= 180 && !p.psuKnown) {
    return { label, status: "warn", detail: tr(`Ce processeur peut consommer ≈ ${c.powerW} W : ton alim doit avoir un câble processeur 8 broches (EPS 4+4). Les très vieilles alims n'ont qu'un 4 broches.`, `This processor can draw ≈ ${c.powerW} W: your power supply needs an 8-pin processor cable (EPS 4+4). Very old power supplies only have a 4-pin one.`) };
  }
  return { label, status: "ok", detail: tr("Le câble processeur 8 broches (EPS) de ton alimentation suffit.", "Your power supply's 8-pin processor (EPS) cable is enough.") };
}

/** Épaisseur des grosses cartes graphiques (2,5 à 3 emplacements). */
export function gpuThickness(p: Profile, g: GpuSpec): Check | undefined {
  if (g.tbp < 220) return undefined;
  const label = tr("Épaisseur", "Thickness");
  if (p.caseSmall || p.formFactor === "mATX" || p.formFactor === "ITX") {
    return { label, status: "warn", detail: tr("Carte épaisse (≈ 2,5 à 3 emplacements) : en micro-ATX ou en petit boîtier, elle peut masquer un port PCIe ou gêner l'alimentation. Vérifie la place sous la carte.", "Thick card (≈ 2.5 to 3 slots): on micro-ATX or in a small case, it can cover a PCIe slot or get in the way of the power supply. Check the space below the card.") };
  }
  return { label, status: "ok", detail: tr("Carte de ≈ 2,5 à 3 emplacements : standard dans un boîtier moyen tour avec une carte mère ATX.", "≈ 2.5 to 3-slot card: standard in a mid-tower case with an ATX motherboard.") };
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

/** Mois et année dans la langue choisie (« octobre 2022 », « October 2022 »). */
const frDate = (iso?: string) => (iso && !Number.isNaN(Date.parse(iso)) ? new Date(iso).toLocaleDateString(currentLang() === "en" ? "en-US" : "fr-FR", { month: "long", year: "numeric" }) : "");

/**
 * BIOS nécessaire pour un processeur sur la carte mère actuelle.
 * - carte connue : on compare la date du BIOS installé à celle du premier BIOS qui accepte ce processeur ;
 * - sinon : règle du chipset (mise à jour conseillée par prudence).
 */
function biosCheck(p: Profile, c: CpuSpec): Check | undefined {
  const fams = biosFamilies(c);
  const known = p.board?.biosMin ? fams.map((f) => [f, p.board!.biosMin![f]] as const).find(([, v]) => v !== undefined) : undefined;
  const flash = p.board?.biosFlashback
    ? tr(" Ta carte peut se mettre à jour sans processeur (bouton dédié).", " Your motherboard can update without a processor (dedicated button).")
    : tr(" Fais-le avec ton processeur actuel, avant le changement : sans ce BIOS, le nouveau processeur ne démarrera pas.", " Do it with your current processor, before the swap: without this BIOS, the new processor won't start.");
  if (known) {
    const min = known[1] as { version: string; date: string } | null;
    if (min === null) return { label: "BIOS", status: "fail", detail: tr(`Le fabricant de ta carte mère ne prend pas en charge ce processeur, même avec le dernier BIOS.`, `Your motherboard's manufacturer doesn't support this processor, even with the latest BIOS.`) };
    const installed = p.biosDate ? Date.parse(p.biosDate) : NaN;
    const minDate = Date.parse(min.date);
    // Les Ryzen 5000 sortis après les premiers (5500, 5600, 5700X…) demandent souvent un BIOS plus récent que le minimum « Ryzen 5000 ».
    const lateZen3 = c.gen === "amd-zen3" && !/x3d/i.test(c.name) && /ryzen \d (5500|5600(?!x)|5700x)\b/i.test(c.name);
    if (!Number.isNaN(installed) && !Number.isNaN(minDate) && installed >= minDate) {
      const yours = `${p.biosVersion ?? tr("installé", "installed")}, ${frDate(p.biosDate)}`;
      return lateZen3
        ? { label: "BIOS", status: "warn", detail: tr(`Ton BIOS (${yours}) prend en charge les premiers Ryzen 5000, mais ce modèle, sorti plus tard, demande parfois un BIOS plus récent : vérifie sa ligne dans la liste des processeurs compatibles de ta carte.`, `Your BIOS (${yours}) supports the first Ryzen 5000 chips, but this model came out later and sometimes needs a newer BIOS: check its line in your motherboard's list of supported processors.`) }
        : { label: "BIOS", status: "ok", detail: tr(`Ton BIOS (${yours}) prend déjà en charge ce processeur (version ${min.version} ou plus récente, d'après le fabricant).`, `Your BIOS (${yours}) already supports this processor (version ${min.version} or newer, according to the manufacturer).`) };
    }
    const minWhen = frDate(min.date) ? ` (${frDate(min.date)})` : "";
    return {
      label: "BIOS",
      status: "warn",
      detail: tr(
        `Il faut le BIOS ${min.version}${minWhen} ou plus récent${lateZen3 ? " (voire plus récent pour ce modèle)" : ""}${p.biosVersion ? `, tu as le ${p.biosVersion}${p.biosDate ? ` (${frDate(p.biosDate)})` : ""}` : ""}.${flash}`,
        `You need BIOS ${min.version}${minWhen} or newer${lateZen3 ? " (possibly newer for this model)" : ""}${p.biosVersion ? `, you have ${p.biosVersion}${p.biosDate ? ` (${frDate(p.biosDate)})` : ""}` : ""}.${flash}`,
      ),
    };
  }
  if (p.chipset?.biosUpdateFor?.includes(c.gen)) {
    return {
      label: "BIOS",
      status: "warn",
      detail: tr(
        `Une mise à jour du BIOS est probablement nécessaire${p.biosVersion ? ` (tu as le ${p.biosVersion}${p.biosDate ? `, ${frDate(p.biosDate)}` : ""})` : ""} : vérifie la version minimale dans la liste des processeurs compatibles de ta carte mère.${flash}`,
        `A BIOS update is probably needed${p.biosVersion ? ` (you have ${p.biosVersion}${p.biosDate ? `, ${frDate(p.biosDate)}` : ""})` : ""}: check the minimum version in your motherboard's list of supported processors.${flash}`,
      ),
    };
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

    const boardLabel = tr("Carte mère", "Motherboard");
    if (dropIn) {
      checks.push({ label: boardLabel, status: "ok", detail: tr(`Compatible avec ta ${p.boardName ?? "carte mère"} (socket ${c.socket}, chipset ${p.chipset!.chipset}).`, `Compatible with your ${p.boardName ?? "motherboard"} (socket ${c.socket}, chipset ${p.chipset!.chipset}).`) });
      const bios = biosCheck(p, c);
      if (bios) checks.push(bios);
      if (c.ramMaxMts.DDR4 && p.ramMts && c.ramMaxMts.DDR4 > p.ramMts && p.ramPlatformMaxMts && p.ramPlatformMaxMts < c.ramMaxMts.DDR4) {
        notes.push(tr(`Avec ce processeur, ta carte mère autorise la RAM jusqu'à ${c.ramMaxMts.DDR4} MT/s.`, `With this processor, your motherboard allows RAM up to ${c.ramMaxMts.DDR4} MT/s.`));
      }
    } else {
      // Changement de plateforme : carte mère, puis RAM, puis ventirad.
      const plan = platformFor(c, p);
      if (!plan) continue;
      const { board, ram } = plan;
      // La nouvelle carte mère fait partie de la proposition : le point est « réglé », pas un problème restant.
      checks.push({
        label: boardLabel,
        status: "fixed",
        detail: tr(
          `${c.socket !== p.socket
            ? `Ce processeur utilise le socket ${c.socket}, ta carte mère est en ${p.socket ?? "?"}`
            : `Ton chipset ${p.chipset?.chipset ?? ""} ne supporte pas cette génération de processeur`} : une carte mère compatible est incluse.`,
          `${c.socket !== p.socket
            ? `This processor uses the ${c.socket} socket, your motherboard is ${p.socket ?? "?"}`
            : `Your ${p.chipset?.chipset ?? ""} chipset doesn't support this processor generation`}: a compatible motherboard is included.`,
        ),
      });
      additions.push({ role: "required", part: board, quantity: 1, reason: tr(`Carte mère ${board.chipset} ${board.formFactor} compatible. ${board.note ?? ""}`, `Compatible ${board.chipset} ${board.formFactor} motherboard. ${catalogText(board.note) ?? ""}`).trim(), models: recommendBoards(board, c, p) });
      const ramLabel = tr("Mémoire vive", "RAM");
      if (ram) {
        checks.push({ label: ramLabel, status: "fixed", detail: tr(`La nouvelle carte mère utilise de la ${board.ramType}, ta RAM ${p.ramType ?? ""} n'est pas compatible : un kit ${board.ramType} est inclus.`, `The new motherboard uses ${board.ramType}, your ${p.ramType ?? ""} RAM isn't compatible: a ${board.ramType} kit is included.`) });
        additions.push({ role: "required", part: ram, quantity: 1, reason: tr(`${ram.sticks * ram.gbPerStick} Go en ${board.ramType}, en dual channel.`, `${ram.sticks * ram.gbPerStick} GB of ${board.ramType}, in dual channel.`) });
      } else {
        checks.push({ label: ramLabel, status: "ok", detail: tr(`Ta RAM ${p.ramType} actuelle est réutilisée.`, `Your current ${p.ramType} RAM is reused.`) });
      }
      const formLabel = tr("Format", "Form factor");
      if (board.formFactor === "ATX" && p.formFactor && p.formFactor !== "ATX") {
        checks.push({ label: formLabel, status: "warn", detail: tr("Carte mère ATX : vérifie que ton boîtier l'accepte.", "ATX motherboard: check that your case can take it.") });
      } else if (!p.formFactor) {
        checks.push({ label: formLabel, status: "warn", detail: tr(`Carte mère ${board.formFactor} : vérifie que ton boîtier l'accepte.`, `${board.formFactor} motherboard: check that your case can take it.`) });
      } else if (board.formFactor === p.formFactor) {
        checks.push({ label: formLabel, status: "ok", detail: tr(`Format ${board.formFactor}, comme ta carte mère actuelle.`, `${board.formFactor} form factor, like your current motherboard.`) });
      } else {
        checks.push({ label: formLabel, status: "ok", detail: tr(`Format ${board.formFactor}, plus compact que ta carte ${p.formFactor} : il rentre dans ton boîtier.`, `${board.formFactor} form factor, more compact than your ${p.formFactor} board: it fits in your case.`) });
      }
      const chip = CHIPSETS.find((x) => x.chipset === board.chipset);
      if (chip?.biosUpdateFor?.includes(c.gen)) {
        checks.push({ label: "BIOS", status: "warn", detail: tr("Certaines cartes en stock ont un BIOS trop ancien pour ce processeur : prends un modèle avec bouton de mise à jour du BIOS sans CPU.", "Some boards in stock have a BIOS too old for this processor: pick a model with a button to update the BIOS without a CPU.") });
      }
      notes.push(tr("Changer de carte mère peut demander de réactiver Windows (connecte ta licence à ton compte Microsoft avant).", "Changing your motherboard may require reactivating Windows (link your license to your Microsoft account first)."));
      if (p.isOem) {
        checks.push({
          label: tr("PC de marque", "Prebuilt PC"),
          status: "warn",
          detail: tr(
            `Les PC ${p.manufacturer ?? "de marque"} utilisent souvent un boîtier, une alimentation et une façade propriétaires : une carte mère standard peut ne pas se fixer ni se brancher. Vérifie le format exact, ou prévois un nouveau boîtier et une alimentation.`,
            `${p.manufacturer ? `${p.manufacturer} PCs` : "Prebuilt PCs"} often use a proprietary case, power supply and front panel: a standard motherboard may not mount or connect. Check the exact form factor, or plan for a new case and power supply.`,
          ),
        });
      }
      if (c.gen === "intel-13" || c.gen === "intel-14") notes.push(tr("Intel 13e/14e gén. : installe le dernier BIOS (microcode à jour) dès le montage.", "Intel 13th/14th gen: install the latest BIOS (updated microcode) right after assembly."));
      checks.push(storageMigration(p, board, 0));
    }

    // Sortie vidéo : un processeur sans puce graphique (F, KF, la plupart des Ryzen AM4) a besoin d'une carte graphique.
    let gpuAfter = p.gpu;
    const videoLabel = tr("Sortie vidéo", "Video output");
    if (!c.igpu && (!p.gpu || p.gpu.integrated)) {
      const g = cheapestGpu();
      checks.push({
        label: videoLabel,
        status: "fail",
        detail: tr("Ce processeur n'a pas de puce graphique et ton PC n'a pas de carte graphique : sans en ajouter une, l'écran resterait noir.", "This processor has no integrated graphics and your PC has no graphics card: without adding one, the screen would stay black."),
      });
      if (g) {
        additions.push({ role: "required", part: g, quantity: 1, reason: tr("Pour avoir une image : ce processeur n'a pas de puce graphique intégrée.", "To get a picture: this processor has no integrated graphics.") });
        gpuAfter = g;
      }
    } else if (!c.igpu) {
      checks.push({ label: videoLabel, status: "ok", detail: tr("Ce processeur n'a pas de puce graphique : l'image passe par ta carte graphique, comme aujourd'hui.", "This processor has no integrated graphics: the picture goes through your graphics card, just like today.") });
    }

    // Ventirad
    const coolNeed = Math.round(c.powerW * 0.75);
    const keepsMount = dropIn || sameMounting(p.socket, c.socket);
    const coolerLabel = tr("Ventirad", "CPU cooler");
    if (p.cooler === "unknown") {
      checks.push({ label: coolerLabel, status: "warn", detail: tr(`Il faut un ventirad capable de dissiper ≈ ${coolNeed} W${keepsMount ? "" : ` et compatible ${c.socket}`}.`, `You need a CPU cooler that can handle ≈ ${coolNeed} W${keepsMount ? "" : ` and is ${c.socket} compatible`}.`) });
      const cool = cheapestCooler(c.socket, coolNeed);
      if (cool && !(c.boxCooler && coolNeed <= 95)) additions.push({ role: "verify", part: cool, quantity: 1, reason: tr(`Si ton ventirad actuel est d'origine ou ne supporte pas ${coolNeed} W.`, `If your current cooler is the stock one or can't handle ${coolNeed} W.`) });
    } else if (!keepsMount) {
      const cool = cheapestCooler(c.socket, coolNeed);
      checks.push({ label: coolerLabel, status: "fail", detail: tr(`La fixation change entre ${p.socket} et ${c.socket} : ton ventirad actuel ne se monte pas (sauf kit de fixation vendu par son fabricant).`, `The mounting changes between ${p.socket} and ${c.socket}: your current cooler won't fit (unless its manufacturer sells a mounting kit).`) });
      if (cool) additions.push({ role: "required", part: cool, quantity: 1, reason: tr(`Fixation ${c.socket} et ≈ ${coolNeed} W à dissiper.`, `${c.socket} mounting and ≈ ${coolNeed} W to handle.`) });
    } else if ((p.coolerW ?? 0) < coolNeed) {
      const cool = cheapestCooler(c.socket, coolNeed);
      checks.push({ label: coolerLabel, status: "fail", detail: tr(`Ton ventirad dissipe ≈ ${p.coolerW} W, ce processeur peut monter à ≈ ${coolNeed} W.`, `Your cooler handles ≈ ${p.coolerW} W, this processor can reach ≈ ${coolNeed} W.`) });
      if (cool) additions.push({ role: "required", part: cool, quantity: 1, reason: tr(`Pour dissiper ≈ ${coolNeed} W sans surchauffe.`, `To handle ≈ ${coolNeed} W without overheating.`) });
    } else {
      checks.push({ label: coolerLabel, status: "ok", detail: tr(`Ton ventirad actuel suffit (≈ ${coolNeed} W).`, `Your current cooler is enough (≈ ${coolNeed} W).`) });
    }
    const newCooler = additions.find((a) => a.part.kind === "cooler")?.part;
    if (newCooler?.kind === "cooler") checks.push(coolerFit(p, newCooler));

    // Alimentation avec la carte graphique (actuelle, ou ajoutée pour la sortie vidéo)
    checkPower(p, c.powerW, gpuAfter, checks, additions, gpuAfter === p.gpu ? tr("avec ta carte graphique actuelle", "with your current graphics card") : tr("avec la carte graphique ajoutée", "with the added graphics card"));
    checks.push(epsCable(p, c, additions.some((a) => a.part.kind === "psu" && a.role === "required")));

    // Gain réel : en jeu, les images/s dépendent du plus faible entre CPU et GPU.
    let gainPercent: number | undefined;
    let gainLabel: string | undefined;
    if (cur) {
      gainPercent = Math.round((c.gaming / cur.gaming - 1) * 100);
      gainLabel = tr(`≈ +${gainPercent} % côté processeur`, `≈ +${gainPercent}% processor performance`);
      const balanceLabel = tr("Équilibre avec la carte graphique", "Balance with the graphics card");
      if (p.gpu && p.gpu.perf <= cur.gpuCeiling) {
        checks.push({ label: balanceLabel, status: "warn", detail: tr(`En 1440p, ta ${p.gpu.name} est déjà le facteur limitant : le gain se verra surtout en 1080p, sur les jeux gourmands en CPU et en multitâche.`, `At 1440p, your ${p.gpu.name} is already the limiting factor: you'll mostly see the gain at 1080p, in CPU-heavy games and when multitasking.`) });
      } else if (p.gpu) {
        checks.push({ label: balanceLabel, status: "ok", detail: tr(`Ta ${p.gpu.name} est aujourd'hui freinée par ton processeur : ce changement la libère.`, `Your ${p.gpu.name} is currently held back by your processor: this upgrade frees it up.`) });
      }
    }

    out.push(finalize({
      id: `cpu-${c.id}`, category: "cpu",
      title: c.name + (c.availability === "used" ? tr(" (occasion)", " (used)") : ""),
      main: c, mainQuantity: 1, gainPercent, gainLabel, checks, additions, notes,
      highlight: dropIn ? tr("Sans changer de carte mère", "No motherboard change") : undefined,
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
    // Les cartes d'entrée de gamme (A620, A520, H610) ont un étage d'alimentation léger : réservées aux processeurs sobres.
    if (["A620", "A520", "H610"].includes(b.chipset) && c.powerW > 120) continue;
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
    const label = tr("Vitesse", "Speed");
    return eff < k.mts
      ? { label, status: "ok", detail: tr(`Tournera à ${eff} MT/s (${mixed ? "alignée sur ta barrette actuelle et " : ""}limite de ta plateforme). Normal et sans risque.`, `Will run at ${eff} MT/s (${mixed ? "matched to your current stick and " : ""}your platform's limit). Normal and safe.`) }
      : { label, status: "ok", detail: tr(`${k.mts} MT/s, supportés par ta plateforme.`, `${k.mts} MT/s, supported by your platform.`) };
  };
  const typeCheck: Check = { label: tr("Type de mémoire", "Memory type"), status: "ok", detail: tr(`${p.ramType}, comme ta carte mère.`, `${p.ramType}, matching your motherboard.`) };
  const bestValue = tr("Meilleur rapport qualité/prix", "Best value");

  // 1. Compléter en dual channel avec une barrette identique
  if (p.ramModules === 1 && freeSlots >= 1 && p.ramStickGb) {
    // Barrette de même capacité, à la vitesse la plus proche de celle déjà installée.
    const kit = RAM_KITS.filter((k) => k.type === p.ramType && k.sticks === 1 && k.gbPerStick === p.ramStickGb).sort((a, b) => Math.abs(a.mts - (p.ramMts ?? a.mts)) - Math.abs(b.mts - (p.ramMts ?? b.mts)))[0];
    if (kit) {
      out.push(finalize({
        id: "ram-add-same", category: "ram", title: tr(`Ajouter 1 × ${p.ramStickGb} Go (dual channel)`, `Add 1 × ${p.ramStickGb} GB (dual channel)`), main: kit, mainQuantity: 1,
        gainLabel: tr("Dual channel : ≈ +10 à 20 % d'images/s dans de nombreux jeux", "Dual channel: ≈ +10 to 20% frame rate in many games"),
        checks: [
          typeCheck,
          { label: tr("Emplacement libre", "Free slot"), status: "ok", detail: tr(`${freeSlots} emplacement${freeSlots > 1 ? "s" : ""} libre${freeSlots > 1 ? "s" : ""} sur ${p.ramSlots}.`, `${freeSlots} free slot${freeSlots > 1 ? "s" : ""} out of ${p.ramSlots}.`) },
          speedCheck(kit, true),
          { label: tr("Barrettes assorties", "Matching sticks"), status: "warn", detail: tr(`Même capacité et même vitesse que ta barrette : le dual channel fonctionnera.${p.ramPartNumber ? ` L'idéal est la même référence (${p.ramPartNumber}).` : ""}`, `Same capacity and speed as your stick: dual channel will work.${p.ramPartNumber ? ` Ideally, get the same part number (${p.ramPartNumber}).` : ""}`) },
        ],
        additions: [],
        notes: [slotHint(p.ramSlotName)],
        highlight: bestValue,
      }));
    }
  }

  // 2. Kits complets (remplacement ou ajout)
  for (const k of RAM_KITS.filter((x) => x.type === p.ramType && x.sticks === 2)) {
    const kitGb = k.sticks * k.gbPerStick;
    // Remplacement
    if (kitGb > p.ramTotalGb && (!p.ramMaxGb || kitGb <= p.ramMaxGb)) {
      out.push(finalize({
        id: `ram-replace-${k.id}`, category: "ram", title: tr(`Passer à ${kitGb} Go (${k.sticks} × ${k.gbPerStick} Go, ${k.type}-${k.mts})`, `Upgrade to ${kitGb} GB (${k.sticks} × ${k.gbPerStick} GB, ${k.type}-${k.mts})`), main: k, mainQuantity: 1,
        gainLabel: tr(`${p.ramTotalGb} → ${kitGb} Go, en dual channel`, `${p.ramTotalGb} → ${kitGb} GB, in dual channel`),
        checks: [typeCheck, { label: tr("Capacité max", "Max capacity"), status: "ok", detail: tr(`Ta carte mère accepte jusqu'à ${p.ramMaxGb ?? "?"} Go.`, `Your motherboard takes up to ${p.ramMaxGb ?? "?"} GB.`) }, speedCheck(k, false)],
        additions: [],
        notes: [tr(`Remplace ta barrette actuelle (tu peux la revendre). ${kitGb >= 64 ? "64 Go : utile pour le montage vidéo, la 3D ou les machines virtuelles, pas pour le jeu." : ""}`, `Replaces your current stick (you can sell it). ${kitGb >= 64 ? "64 GB: useful for video editing, 3D or virtual machines, not for gaming." : ""}`).trim()],
      }));
    }
    // Ajout d'un kit identique à une config déjà en dual channel
    if (p.ramModules === 2 && freeSlots >= 2 && p.ramStickGb === k.gbPerStick) {
      out.push(finalize({
        id: `ram-add-${k.id}`, category: "ram", title: tr(`Ajouter ${kitGb} Go (total ${p.ramTotalGb + kitGb} Go, ${k.type}-${k.mts})`, `Add ${kitGb} GB (${p.ramTotalGb + kitGb} GB total, ${k.type}-${k.mts})`), main: k, mainQuantity: 1,
        gainLabel: tr(`${p.ramTotalGb} → ${p.ramTotalGb + kitGb} Go`, `${p.ramTotalGb} → ${p.ramTotalGb + kitGb} GB`),
        checks: [typeCheck, { label: tr("Emplacements libres", "Free slots"), status: "ok", detail: tr("2 emplacements libres.", "2 free slots.") }, speedCheck(k, true),
          { label: tr("4 barrettes", "4 sticks"), status: "warn", detail: tr("Avec 4 barrettes, la vitesse max baisse parfois légèrement.", "With 4 sticks, the max speed sometimes drops slightly.") }],
        additions: [], notes: [],
      }));
    }
  }
  return out.sort((a, b) => a.total - b.total);
}

/** Où placer la 2e barrette : le même numéro d'emplacement, sur l'autre canal. */
function slotHint(slot?: string): string {
  const m = slot?.match(/Channel\s?([AB])[-_ ]?DIMM\s?(\d)/i);
  if (!m) return tr("Place la nouvelle barrette sur l'autre canal mémoire (voir le manuel de la carte mère pour l'emplacement exact).", "Put the new stick on the other memory channel (see the motherboard manual for the exact slot).");
  const other = m[1].toUpperCase() === "A" ? "B" : "A";
  return tr(`Ta barrette est en ${slot} : place la nouvelle en Channel${other}-DIMM${m[2]} pour activer le dual channel (repère sur la carte mère ou dans le manuel).`, `Your stick is in ${slot}: put the new one in Channel${other}-DIMM${m[2]} to enable dual channel (marked on the motherboard or in the manual).`);
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
        label: tr("PC portable", "Laptop"),
        status: "warn",
        detail: s.iface === "HDD"
          ? tr("Un disque dur 3,5 pouces ne rentre pas dans un PC portable : prends plutôt un disque externe USB.", "A 3.5-inch hard drive doesn't fit in a laptop: get an external USB drive instead.")
          : s.iface === "SATA"
          ? tr("Seulement si ton portable a un emplacement 2,5 pouces (de moins en moins courant) : vérifie la fiche de ton modèle.", "Only if your laptop has a 2.5-inch bay (less and less common): check your model's spec sheet.")
          : tr("Les portables n'ont souvent qu'un emplacement M.2 : tu remplaces alors ton SSD actuel (clonage du disque à prévoir).", "Laptops often have only one M.2 slot: you'd then replace your current SSD (plan to clone the drive)."),
      });
    }
    const plugLabel = tr("Branchement", "Connection");
    const speedLabel = tr("Vitesse", "Speed");
    if (s.iface === "HDD") {
      if (p.isLaptop) continue;
      checks.push({ label: plugLabel, status: "ok", detail: tr("Port SATA + câble SATA + câble d'alimentation SATA, et un emplacement 3,5 pouces libre dans le boîtier (vérifie : les boîtiers récents n'en ont parfois qu'un ou deux).", "SATA port + SATA cable + SATA power cable, and a free 3.5-inch bay in the case (check: recent cases sometimes only have one or two).") });
      notes.push(tr("Un disque dur est 30 à 50 fois plus lent qu'un SSD pour ouvrir des fichiers : idéal pour stocker photos, vidéos et sauvegardes, pas pour Windows ni les jeux.", "A hard drive is 30 to 50 times slower than an SSD at opening files: great for storing photos, videos and backups, not for Windows or games."));
    } else if (s.iface === "SATA") {
      checks.push({ label: plugLabel, status: "ok", detail: tr("Port SATA + câble SATA (souvent fourni avec la carte mère) + câble d'alimentation SATA.", "SATA port + SATA cable (often included with the motherboard) + SATA power cable.") });
      if (m2Free && m2Free > 0) notes.push(tr("Un SSD NVMe est 3 à 6 fois plus rapide pour un prix proche : préfère-le si tu as un emplacement M.2 libre.", "An NVMe SSD is 3 to 6 times faster for a similar price: go for it if you have a free M.2 slot."));
    } else {
      const m2Label = tr("Emplacement M.2", "M.2 slot");
      if (m2Free == null) {
        checks.push({ label: m2Label, status: "warn", detail: tr("Carte mère non répertoriée : vérifie qu'il reste un emplacement M.2 libre.", "Motherboard not in our database: check that there's a free M.2 slot left.") });
      } else if (m2Free <= 0) {
        continue; // pas de place : seules les options SATA restent proposées
      } else {
        const notesText = m2Sharing.map(sharingText).join(" ");
        checks.push({
          label: m2Label,
          status: m2Sharing.length ? "warn" : "ok",
          detail: tr(
            `${m2Free} emplacement${m2Free > 1 ? "s" : ""} M.2 libre${m2Free > 1 ? "s" : ""} sur ${p.m2Total}${nextM2Gen ? ` (le prochain en PCIe ${nextM2Gen}.0)` : ""}.${m2Sharing.length ? ` À savoir sur ta carte mère : ${notesText}` : ""}`,
            `${m2Free} free M.2 slot${m2Free > 1 ? "s" : ""} out of ${p.m2Total}${nextM2Gen ? ` (the next one is PCIe ${nextM2Gen}.0)` : ""}.${m2Sharing.length ? ` Good to know about your motherboard: ${notesText}` : ""}`,
          ),
        });
      }
      if (s.iface === "NVMe5") {
        // Le PCIe 5.0 n'a d'intérêt que sur un emplacement PCIe 5.0 : ailleurs, il coûte plus cher pour la même vitesse.
        if (gen < 5) {
          checks.push({ label: speedLabel, status: "warn", detail: tr(`Ton emplacement M.2 est en PCIe ${gen}.0 : ce SSD y fonctionne, mais limité à ≈ ${gen === 4 ? "7 000" : "3 500"} Mo/s. Un SSD PCIe 4.0 fait la même chose pour moins cher.`, `Your M.2 slot is PCIe ${gen}.0: this SSD works in it, but is limited to ≈ ${gen === 4 ? "7,000" : "3,500"} MB/s. A PCIe 4.0 SSD does the same for less.`) });
        } else {
          checks.push({ label: speedLabel, status: "ok", detail: tr("≈ 12 000 Mo/s sur ton emplacement PCIe 5.0. Il chauffe : utilise le dissipateur de la carte mère.", "≈ 12,000 MB/s in your PCIe 5.0 slot. It runs hot: use the motherboard's heatsink.") });
        }
        notes.push(tr("En jeu, un SSD PCIe 5.0 ne charge pas visiblement plus vite qu'un PCIe 4.0 : il sert surtout aux gros transferts de fichiers.", "In games, a PCIe 5.0 SSD doesn't load noticeably faster than a PCIe 4.0 one: it's mostly useful for large file transfers."));
      } else if (s.iface === "NVMe4" && gen < 4) {
        checks.push({ label: speedLabel, status: "ok", detail: tr(`SSD PCIe 4.0 sur ${nextM2Gen ? "un emplacement" : "ta plateforme"} PCIe 3.0 : il fonctionne, limité à ≈ 3 500 Mo/s. Inutile de payer plus cher pour un modèle haut de gamme.`, `PCIe 4.0 SSD on ${nextM2Gen ? "a" : "your"} PCIe 3.0 ${nextM2Gen ? "slot" : "platform"}: it works, limited to ≈ 3,500 MB/s. No need to pay more for a high-end model.`) });
      } else {
        checks.push({ label: speedLabel, status: "ok", detail: s.iface === "NVMe3" ? tr("≈ 3 500 Mo/s, la pleine vitesse de ton port.", "≈ 3,500 MB/s, the full speed of your slot.") : tr("≈ 7 000 Mo/s.", "≈ 7,000 MB/s.") });
      }
      if (!p.board?.sharing) notes.push(tr("Sur certaines cartes mères, le 2e emplacement M.2 désactive 1 ou 2 ports SATA : voir le manuel.", "On some motherboards, the 2nd M.2 slot disables 1 or 2 SATA ports: see the manual."));
    }
    out.push(finalize({
      id: `ssd-${s.id}`, category: "storage", title: s.name, main: s, mainQuantity: 1,
      gainLabel: s.tb < 1 ? tr(`+${s.tb * 1000} Go`, `+${s.tb * 1000} GB`) : tr(`+${s.tb} To`, `+${s.tb} TB`), checks, additions: [], notes,
    }));
  }
  return highlight(out.sort((a, b) => a.main.kind === "ssd" && b.main.kind === "ssd" ? a.main.tb - b.main.tb || a.total - b.total : 0));
}

// ---------------------------------------------------------------------------

/** Marque la meilleure proposition en gain par euro. */
function highlight(list: Proposal[]): Proposal[] {
  const scored = list.filter((x) => x.gainPercent && x.gainPercent > 0 && x.total > 0 && !x.highlight);
  const best = scored.sort((a, b) => b.gainPercent! / b.totalIfVerify - a.gainPercent! / a.totalIfVerify)[0];
  if (best) best.highlight = tr("Meilleur rapport qualité/prix", "Best value");
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
    if (m2) why.push(tr(`${m2} emplacement${m2 > 1 ? "s" : ""} M.2${b.m2Gens?.includes(5) ? " dont un en PCIe 5.0" : ""}`, `${m2} M.2 slot${m2 > 1 ? "s" : ""}${b.m2Gens?.includes(5) ? ", one of them PCIe 5.0" : ""}`));
    if (b.pcieGpu === 5) why.push(tr("port graphique PCIe 5.0", "PCIe 5.0 graphics card slot"));
    if (b.biosFlashback) why.push(tr("BIOS à jour sans processeur", "BIOS update without a processor"));
    if (/wifi|\bax\b/i.test(b.name)) why.push(tr("Wi-Fi intégré", "built-in Wi-Fi"));
    if (b.sata) why.push(tr(`${b.sata} ports SATA`, `${b.sata} SATA ports`));
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
    const others = sorted.slice(1, 4).map((x) => {
      const name = (x.main as CpuSpec).name.replace(/^(AMD|Intel) /, "");
      return tr(`${name} (${x.total} € au total)`, `${name} (€${x.total} in total)`);
    });
    const boardName = board.name.replace(/^Carte mère /, "").replace(/^Motherboard /, "");
    out.push(
      finalize({
        id: `board-${board.id}`,
        sourceId: first.id,
        category: "board",
        title: tr(`Passer en ${board.socket} : ${boardName}`, `Move to ${board.socket}: ${boardName}`),
        main: board,
        mainQuantity: 1,
        gainLabel: first.gainLabel,
        gainPercent: first.gainPercent,
        highlight: undefined,
        checks: first.checks,
        additions: [
          { role: "required", part: cpu, quantity: 1, reason: tr(`Le processeur le moins cher qui apporte un vrai gain sur cette plateforme.`, `The cheapest processor that brings a real gain on this platform.`) },
          ...first.additions.filter((a) => a.part.kind !== "board"),
        ],
        mainModels: boardAdd.models,
        notes: [
          ...(others.length ? [tr(`Autres processeurs possibles sur cette carte : ${others.join(", ")}.`, `Other processors that work on this motherboard: ${others.join(", ")}.`)] : []),
          board.socket === "AM5" ? tr("Le socket AM5 est prévu pour les prochaines générations de Ryzen : tu pourras changer de processeur plus tard sans changer de carte.", "The AM5 socket is planned for future Ryzen generations: you'll be able to upgrade your processor later without changing the motherboard.") : "",
          board.socket === "LGA1700" ? tr("Le socket LGA1700 est en fin de série : pas de nouveau processeur Intel prévu dessus.", "The LGA1700 socket is at the end of its life: no new Intel processors are planned for it.") : "",
        ].filter(Boolean),
      }),
    );

  }
  return out.sort((a, b) => a.total - b.total);
}
