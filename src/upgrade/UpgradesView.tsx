import { T } from "../glossary";
import { useMemo, useState, type ReactNode } from "react";
import type { Report } from "../types";
import type { Category, Check, Part, Proposal } from "./types";
import { buildProfile, missingAnswers, saveAnswers, type Answers, type Profile } from "./profile";
import { proposeAll } from "./engine";
import { catalogDate, catalogText, CATALOG_DATE } from "./catalog";
import { priceInfo, pricesFile, trendOf } from "./prices";
import { PriceNotice, usePrices } from "./PriceSheet";
import { BrandLogo, Icon, type IconName } from "../icons";
import { impactOf, type Goal, type Impact, type Verdict } from "./goal";
import { AdditionRow, CompatSummary, ItemRow, KindIcons, ModelPicks, SelectButton, euros, kindLabel } from "./PlanView";
import { goalSentence } from "./GoalViews";
import { currentLang, tr } from "../settings";

const tabs = (): { id: Category; label: string; icon: IconName }[] => [
  { id: "gpu", label: tr("Carte graphique", "Graphics card"), icon: "gpu" },
  { id: "cpu", label: tr("Processeur", "Processor"), icon: "chip" },
  { id: "board", label: tr("Carte mère", "Motherboard"), icon: "board" },
  { id: "ram", label: tr("Mémoire vive", "RAM"), icon: "ram" },
  { id: "storage", label: tr("Stockage", "Storage"), icon: "disk" },
];

interface Scored {
  p: Proposal;
  impact: Impact;
  inBudget: boolean;
}

export function UpgradesView({
  report, answers, setAnswers, pricesVersion, goal, verdict, initialTab, onEditGoal,
}: {
  report: Report; answers: Answers; setAnswers: (a: Answers) => void; pricesVersion: number;
  goal: Goal; verdict: Verdict; initialTab?: string; onEditGoal: () => void;
}) {
  // Onglet de départ : celui demandé, sinon le premier composant qui bloque l'objectif.
  const firstFix = verdict.needs.find((n) => n.fix && n.status !== "ok")?.fix;
  const [tab, setTab] = useState<Category>(() => (initialTab as Category) ?? firstFix ?? "gpu");
  const [showForm, setShowForm] = useState(false);
  const [showOver, setShowOver] = useState(false);
  const [brand, setBrand] = useState<string>("all");
  const profile = useMemo(() => buildProfile(report, answers), [report, answers]);
  // pricesVersion : les prix du catalogue ont été mis à jour, on recalcule les totaux.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const all = useMemo(() => proposeAll(profile), [profile, pricesVersion]);
  const market = pricesFile();
  const marketCount = market ? Object.keys(market.items).length : 0;
  const missing = missingAnswers(answers);
  // Le budget ne s'applique qu'une fois l'objectif défini : avant, le budget par défaut n'a pas été choisi par l'utilisateur.
  const budget = goal.configured ? goal.budget : null;

  // Chaque proposition est évaluée face à l'objectif : gain réel, objectif atteint, budget.
  const scored: Scored[] = useMemo(
    () =>
      all[tab].map((p) => ({
        p,
        // Onglet « Carte mère » : l'effet vient du processeur qui accompagne la carte.
        impact:
          tab === "board"
            ? impactOf(goal, profile, verdict, (p.additions.find((a) => a.part.kind === "cpu")?.part ?? p.main) as never, "cpu")
            : impactOf(goal, profile, verdict, p.main as never, tab, ramAfter(p, profile.ramTotalGb)),
        inBudget: budget == null || p.total <= budget,
      })),
    [all, tab, goal, profile, verdict, budget],
  );
  // Ordre : dans le budget d'abord ; puis celles qui atteignent l'objectif ; puis celles qui aident ; puis le prix.
  const rank = (s: Scored) => (s.impact.reachesGoal ? 0 : s.impact.relevant ? 1 : 2);
  // Filtre par marque (cartes graphiques et processeurs).
  const brandOf = (s: Scored) => ("brand" in s.p.main ? (s.p.main.brand as string) : undefined);
  const brands = [...new Set(scored.map(brandOf).filter(Boolean))] as string[];
  const visible = brand === "all" ? scored : scored.filter((s) => brandOf(s) === brand);
  const sorted = [...visible].sort((a, b) => rank(a) - rank(b) || a.p.total - b.p.total);
  const inBudget = sorted.filter((s) => s.inBudget);
  const over = sorted.filter((s) => !s.inBudget);
  const cheapestGoal = scored.filter((s) => s.impact.reachesGoal).sort((a, b) => a.p.total - b.p.total)[0];
  const tabNeed = verdict.needs.find((n) => n.fix === tab && n.status !== "ok");

  const update = (patch: Partial<Answers>) => {
    const next = { ...answers, ...patch };
    saveAnswers(next);
    setAnswers(next);
  };

  // Compteurs : pièces compatibles avec ce PC ; une fois le budget choisi, seulement celles qui y rentrent.
  const tabCount = (id: Category) => (budget == null ? all[id].length : all[id].filter((p) => p.total <= budget).length);
  const blocking = (id: Category) => verdict.needs.some((n) => n.fix === id && n.status !== "ok");
  const advice = !goal.configured
    ? undefined
    : tabNeed
      ? cheapestGoal
        ? tr(
            `${tabNeed.detail} La solution la moins chère pour atteindre ton objectif coûte ${cheapestGoal.p.total} €${budget != null && cheapestGoal.p.total > budget ? `, au-delà de ton budget de ${budget} €` : ""}.`,
            `${tabNeed.detail} The cheapest way to reach your goal costs ${euros(cheapestGoal.p.total)}${budget != null && cheapestGoal.p.total > budget ? `, over your budget of ${euros(budget)}` : ""}.`,
          )
        : tr(
            `${tabNeed.detail} Aucune pièce de cet onglet ne suffit seule : le plan combiné de « Mon objectif » associe plusieurs pièces.`,
            `${tabNeed.detail} No single part in this tab is enough on its own: the combined plan in "My goal" puts several parts together.`,
          )
      : verdict.level === "ok"
        ? tr("Ton PC atteint déjà ton objectif : tout ce qui suit est du bonus.", "Your PC already meets your goal: everything below is a bonus.")
        : tr("Cette pièce ne limite pas ton objectif. Les onglets marqués d'un point sont prioritaires.", "This part isn't limiting your goal. Tabs marked with a dot come first.");

  return (
    <div className="up-page">
      <header className="gp-head">
        <div>
          <h1>{tr("Toutes les pièces", "All parts")}</h1>
          <p className="gp-goal">
            {tr(
              "Le catalogue complet des pièces compatibles avec ton PC, vérifiées une par une. Pour un conseil tout prêt, va dans Mon plan.",
              "The full catalogue of parts compatible with your PC, checked one by one. For ready-made advice, go to My plan.",
            )}
          </p>
        </div>
      </header>

      <div className="up-context">
        <p>
          {goal.configured ? (
            <>
              {tr("Objectif : ", "Goal: ")}{goalSentence(goal).charAt(0).toLowerCase() + goalSentence(goal).slice(1)}
              {verdict.fps ? tr(`, avec environ ${verdict.fps.fps} i/s aujourd'hui`, `, with about ${verdict.fps.fps} fps today`) : ""}.{" "}
            </>
          ) : (
            tr("Aucun objectif défini : les propositions ne sont pas classées selon ton usage. ", "No goal set: the suggestions aren't ranked for how you use your PC. ")
          )}
          <button className="link" onClick={onEditGoal}>
            {goal.configured ? tr("Modifier l'objectif", "Edit the goal") : tr("Définir mon objectif", "Set my goal")}
          </button>
        </p>
        <p>
          <ProfileSentence p={profile} answers={answers} missing={missing} />{" "}
          <button className="link" onClick={() => setShowForm(!showForm)}>
            {showForm ? tr("Fermer", "Close") : missing > 0 ? tr("Renseigner ces infos", "Fill in these details") : tr("Modifier", "Edit")}
          </button>
        </p>
        {profile.unsupportedPlatform && (
          <p className="up-unsupported">
            {tr(
              `Ta carte mère est une plateforme ${profile.unsupportedPlatform} : PCEvolu ne connaît pas ses règles de compatibilité. Les processeurs proposés passent tous par un changement de carte mère, et les autres pièces restent à vérifier sur la fiche de ta carte.`,
              `Your motherboard is a ${profile.unsupportedPlatform} platform: PCEvolu doesn't know its compatibility rules. All suggested processors require a new motherboard, and the other parts still need checking against your board's spec sheet.`,
            )}
          </p>
        )}
        {showForm && (
          <div className="up-form">
            <Questionnaire a={answers} update={update} />
          </div>
        )}
      </div>

      <div className="seg up-seg" role="tablist">
        {tabs().map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? "on" : ""}
            onClick={() => {
              setTab(t.id);
              setBrand("all");
            }}
          >
            {blocking(t.id) && <span className="tab-dot" title={tr("Limite ton objectif", "Limits your goal")} />}
            <Icon name={t.icon} className="seg-ico" />
            {t.label}
            <span className="seg-count">{tabCount(t.id)}</span>
          </button>
        ))}
      </div>

      {advice && all[tab].length > 0 && <p className={`up-advice ${tabNeed ? "need" : ""}`}>{advice}</p>}

      {brands.length > 1 && (
        <div className="brand-filter">
          <span className="muted small">{tr("Marque", "Brand")}</span>
          {["all", ...brands.sort()].map((b) => (
            <button key={b} className={`chip-btn ${brand === b ? "on" : ""}`} onClick={() => setBrand(b)}>
              {b !== "all" && <BrandLogo brand={b} className="chip-logo" />}
              {b === "all" ? tr("Toutes", "All") : b}
            </button>
          ))}
        </div>
      )}

      {all[tab].length === 0 ? (
        <p className="up-empty">{emptyMessage(tab, profile)}</p>
      ) : (
        <>
          {inBudget.length === 0 && budget != null && <p className="up-empty">{tr(`Rien dans cet onglet ne rentre dans ton budget de ${budget} €.`, `Nothing in this tab fits your budget of ${euros(budget)}.`)}</p>}
          <ul className="rows">
            {inBudget.map((s) => (
              <ProposalRow key={s.p.id} p={s.p} impact={goal.configured ? s.impact : undefined} />
            ))}
          </ul>
          {over.length > 0 && (
            <div className="over-budget">
              <button className="link" onClick={() => setShowOver(!showOver)}>
                {tr(
                  `${showOver ? "Masquer" : "Afficher"} ${over.length === 1 ? "la proposition" : `les ${over.length} propositions`} au-delà de ton budget`,
                  `${showOver ? "Hide" : "Show"} ${over.length === 1 ? "the suggestion" : `the ${over.length} suggestions`} over your budget`,
                )}
              </button>
              {showOver && (
                <ul className="rows dim">
                  {over.map((s) => (
                    <ProposalRow key={s.p.id} p={s.p} impact={goal.configured ? s.impact : undefined} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
      <PriceNotice
        extra={tr(
          `${marketCount > 0 ? `${marketCount} composants ont un prix relevé ; les autres prix sont indicatifs (${CATALOG_DATE}).` : ""} Les performances sont des ordres de grandeur : vérifie toujours la fiche du modèle exact avant d'acheter.`,
          `${marketCount > 0 ? `${marketCount} components have a tracked price; other prices are indicative (${catalogDate()}).` : ""} Performance figures are rough estimates: always check the exact model's spec sheet before buying.`,
        )}
      />
    </div>
  );
}



function emptyMessage(tab: Category, p: Profile) {
  if (p.isLaptop && (tab === "gpu" || tab === "cpu"))
    return tr(
      "Sur un PC portable, le processeur et la carte graphique sont soudés à la carte mère : impossible de les changer. Les gains possibles passent par la RAM et le stockage.",
      "On a laptop, the processor and graphics card are soldered to the motherboard: they can't be replaced. Any gains will come from RAM and storage.",
    );
  if (p.isLaptop && tab === "ram")
    return tr(
      "PC portable : la RAM est au format SO-DIMM, et souvent soudée sur les modèles récents. Vérifie dans la fiche de ton modèle s'il reste un emplacement libre.",
      "Laptop: the RAM uses the SO-DIMM format and is often soldered on recent models. Check your model's spec sheet to see if there's a free slot.",
    );
  if (tab === "ram" && p.ramType === "DDR3")
    return tr(
      "Ton PC utilise de la DDR3, qui n'est plus vendue neuve. Plutôt que d'en racheter, mieux vaut investir dans une nouvelle plateforme (onglet Processeur).",
      "Your PC uses DDR3, which is no longer sold new. Rather than buying more, it's better to invest in a new platform (Processor tab).",
    );
  if (tab === "gpu" && !p.gpu) return tr("Ta carte graphique n'a pas été reconnue : impossible de calculer un gain fiable.", "Your graphics card wasn't recognised: a reliable gain can't be calculated.");
  if (tab === "cpu" && !p.cpu) return tr("Ton processeur n'a pas été reconnu.", "Your processor wasn't recognised.");
  if (tab === "board" && p.isLaptop) return tr("Sur un PC portable, la carte mère ne se change pas.", "On a laptop, the motherboard can't be replaced.");
  if (tab === "board") return tr(
      "Aucun changement de plateforme n'apporte de vrai gain pour l'instant : ta carte mère actuelle suffit pour les processeurs proposés.",
      "No platform change brings a real gain for now: your current motherboard is enough for the suggested processors.",
    );
  if (tab === "ram" && !p.ramType) return tr("Type de mémoire non détecté.", "Memory type not detected.");
  return tr("Aucun upgrade pertinent dans le catalogue pour l'instant : ce composant est déjà au niveau.", "No relevant upgrade in the catalogue for now: this component is already up to the task.");
}

// ---------------------------------------------------------------------------
// Carte de proposition
// ---------------------------------------------------------------------------


/**
 * D'où vient chaque point de compatibilité :
 * - « scan » : ce que Windows a lu sur le PC (processeur, carte mère, RAM, disques…), comparé à la fiche du fabricant ;
 * - « answers » : ce que Windows ne voit pas (alimentation, boîtier, refroidissement), donc tes réponses ou une hypothèse prudente ;
 * - « estimate » : une estimation de performance de PCEvolu, pas une règle de compatibilité.
 */
const CHECK_SOURCE: Record<string, "scan" | "answers" | "estimate"> = {
  "Carte mère": "scan", "Mémoire vive": "scan", "Type de mémoire": "scan", "Emplacement libre": "scan", "Emplacements libres": "scan",
  "Capacité max": "scan", "Emplacement M.2": "scan", "Port PCIe": "scan", "Sortie vidéo": "scan", "Barrettes assorties": "scan",
  "Stockage (migration)": "scan", "PC de marque": "scan", "PC portable": "scan", BIOS: "scan", Vitesse: "scan", "4 barrettes": "scan", Branchement: "scan",
  Alimentation: "answers", "Connecteur 16 broches": "answers", "Connecteur carte graphique": "answers", "Câbles PCIe": "answers",
  "Place dans le boîtier": "answers", "Ventilation du boîtier": "answers", "Hauteur du ventirad": "answers", "Encombrement du ventirad": "answers",
  Ventirad: "answers", "Câble processeur": "answers", Format: "answers", "Épaisseur": "answers",
  "Équilibre avec le processeur": "estimate", "Équilibre avec la carte graphique": "estimate", "Équilibre de la config": "estimate",
  // Mêmes vérifications en anglais (libellés produits par engine.ts / optimizer.ts quand l'app est en anglais).
  Motherboard: "scan", RAM: "scan", "Memory type": "scan", "Free slot": "scan", "Free slots": "scan", "Max capacity": "scan", "M.2 slot": "scan",
  "PCIe slot": "scan", "Video output": "scan", "Matching sticks": "scan", "Storage (migration)": "scan", "Prebuilt PC": "scan", Laptop: "scan",
  Speed: "scan", "4 sticks": "scan", Connection: "scan",
  "Power supply": "answers", "16-pin connector": "answers", "Graphics card connector": "answers", "PCIe cables": "answers", "Room in the case": "answers",
  "Case airflow": "answers", "Cooler height": "answers", "Cooler clearance": "answers", "CPU cooler": "answers", "Processor cable": "answers",
  "Form factor": "answers", Thickness: "answers",
  "Balance with the processor": "estimate", "Balance with the graphics card": "estimate", "Setup balance": "estimate",
};
const sourceText = (s: "scan" | "answers" | "estimate"): string =>
  ({
    scan: tr("Source : analyse de ton PC et fiches des fabricants", "Source: scan of your PC and manufacturers' spec sheets"),
    answers: tr(
      "Source : tes réponses (sinon une hypothèse prudente) et fiches des fabricants",
      "Source: your answers (or a cautious assumption) and manufacturers' spec sheets",
    ),
    estimate: tr("Estimation PCEvolu : un ordre de grandeur, pas une règle de compatibilité", "PCEvolu estimate: a rough figure, not a compatibility rule"),
  })[s];

export function CheckRow({ c }: { c: Check }) {
  const icon = c.status === "ok" ? "check" : c.status === "warn" ? "alert" : c.status === "fixed" ? "refresh" : "cross";
  const source = CHECK_SOURCE[c.label];
  return (
    <li className={`chk c-${c.status}`}>
      <Icon name={icon} />
      <div>
        <div className="chk-label">{c.label}</div>
        <div className="chk-detail"><T>{c.detail}</T></div>
        {source && <div className="chk-source">{sourceText(source)}</div>}
      </div>
    </li>
  );
}

/** Quantité de RAM après une proposition (ajout ou remplacement). */
function ramAfter(p: Proposal, currentGb: number): number | undefined {
  if (p.main.kind !== "ram") return undefined;
  const kitGb = p.main.sticks * p.main.gbPerStick;
  return p.id.startsWith("ram-add") ? currentGb + kitGb : kitGb;
}

/** Une proposition : une ligne (titre, effet, compatibilité, prix), le détail s'ouvre au clic. */
function ProposalRow({ p, impact }: { p: Proposal; impact?: Impact }) {
  const [open, setOpen] = useState(false);
  const required = p.additions.filter((a) => a.role === "required");
  const extras = p.additions.filter((a) => a.role !== "recommended");
  const advised = p.additions.filter((a) => a.role === "recommended");
  const warns = p.checks.filter((c) => c.status === "warn").length;
  const fails = p.checks.filter((c) => c.status === "fail").length;
  const compat = required.length
    ? tr(
        `avec ${required.map((a) => kindLabel(a.part).toLowerCase()).join(" et ")} en plus`,
        `plus ${required.map((a) => `a ${kindLabel(a.part).toLowerCase()}`).join(" and ")}`,
      )
    : fails
      ? tr("incompatible", "not compatible")
      : warns
        ? tr(`compatible, ${warns} point${warns > 1 ? "s" : ""} à vérifier`, `compatible, ${warns} ${warns > 1 ? "points" : "point"} to check`)
        : tr("compatible tel quel", "compatible as is");
  const effect = impact?.label ?? p.gainLabel;
  const flag = impact?.reachesGoal
    ? tr("Atteint ton objectif", "Reaches your goal")
    : impact && !impact.relevant
      ? tr("Peu utile pour ton objectif", "Not very useful for your goal")
      : p.highlight;

  return (
    <li className={`row prop-row ${open ? "open" : ""}`}>
      <button className="row-line" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="row-main">
          <span className="row-title">
            <KindIcons parts={[p.main, ...required.map((a) => a.part)]} />
            {catalogText(p.title)}
            {flag && <span className={`row-flag ${impact?.reachesGoal ? "ok" : impact && !impact.relevant ? "dim" : ""}`}>{flag}</span>}
          </span>
          <span className="row-sub">
            {effect ? `${effect.charAt(0).toUpperCase()}${effect.slice(1)}, ` : ""}
            {compat}.
          </span>
        </span>
        <span className="row-price num">
          {euros(p.total)}
          {p.totalIfVerify > p.total && <span className="row-price-max">{tr(`jusqu'à ${p.totalIfVerify} €`, `up to ${euros(p.totalIfVerify)}`)}</span>}
        </span>
        <Icon name="chevron" className={`chev ${open ? "open" : ""}`} />
      </button>
      {open && (
        <div className="row-detail pd">
          <div className="sel-bar">
            <SelectButton p={p} />
          </div>
          <ul className="pd-items">
            <ItemRow kind={kindLabel(p.main)} part={p.main} amount={price(p.main) * p.mainQuantity}>
              {p.mainModels?.length ? <ModelPicks models={p.mainModels} /> : null}
            </ItemRow>
            {extras.map((a, i) => (
              <AdditionRow key={i} a={a} />
            ))}
          </ul>
          <CompatSummary checks={p.checks} />
          {p.pairing && (
            <section className="pairing">
              <h4 className="pairing-title">{tr("Pour en profiter pleinement", "To get the most out of it")}</h4>
              <p className="pairing-text">
                {tr(
                  `Ton processeur limite cette carte à ≈ ${p.pairing.usedBefore} % de sa puissance. Avec un`,
                  `Your processor limits this card to ≈ ${p.pairing.usedBefore}% of its power. With a`,
                )}{" "}
                <b>{p.pairing.cpu.name.replace(/^(AMD|Intel) /, "")}</b>
                {p.pairing.parts.length
                  ? tr(
                      ` (avec ${p.pairing.parts.map((x) => ({ board: "la carte mère", ram: "la mémoire", cooler: "le ventirad", psu: "l'alimentation" } as Record<string, string>)[x.kind] ?? kindLabel(x).toLowerCase()).join(", ").replace(/, ([^,]*)$/, " et $1")} qu'il demande)`,
                      ` (with the ${p.pairing.parts.map((x) => ({ board: "motherboard", ram: "memory", cooler: "CPU cooler", psu: "power supply" } as Record<string, string>)[x.kind] ?? kindLabel(x).toLowerCase()).join(", ").replace(/, ([^,]*)$/, " and $1")} it needs)`,
                    )
                  : ""}
                {tr(`, elle serait exploitée à ≈ ${p.pairing.usedAfter} %.`, `, it would run at ≈ ${p.pairing.usedAfter}%.`)}
              </p>
              <ul className="pairing-parts">
                {[p.pairing.cpu, ...p.pairing.parts].map((x) => (
                  <li key={x.id}>
                    <KindIcons parts={[x]} />
                    <span>{x.name}</span>
                    <span className="num">{euros(price(x))}</span>
                  </li>
                ))}
              </ul>
              <p className="pairing-total">
                {tr("Surcoût : ", "Extra cost: ")}<b className="num">{euros(p.pairing.extra)}</b>{tr(", soit ", ", so ")}
                <b className="num">{euros(p.total + p.pairing.extra)}</b>{tr(" pour l'ensemble.", " in total.")}
                <span className="muted">
                  {tr(
                    " Mon plan recalcule l'alimentation et le budget pour la combinaison complète.",
                    " My plan recalculates the power supply and budget for the full combination.",
                  )}
                </span>
              </p>
            </section>
          )}
          {advised.length > 0 && (
            <details className="pd-advised">
              <summary>{tr(`Conseillé en plus (${advised.length})`, `Also recommended (${advised.length})`)}</summary>
              <ul className="pd-items">
                {advised.map((a, i) => (
                  <AdditionRow key={i} a={a} />
                ))}
              </ul>
            </details>
          )}
          {p.notes.length > 0 && (
            <ul className="notes">
              {p.notes.map((n, i) => (
                <li key={i}><T>{n}</T></li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}


/** « Médiane de 6 marchands · dès 549,99 € chez Cdiscount », ou « prix indicatif » sans relevé. */
export function MarketLine({ part }: { part: Part }) {
  const { open, alerts } = usePrices();
  const info = priceInfo(part.id);
  const watched = alerts.some((a) => a.id === part.id);
  const sheet = () => open({ id: part.id, name: part.name, price: price(part) });
  if (!info) {
    return (
      <button className="market muted small market-btn" onClick={sheet}>
        {tr("Prix indicatif, pas encore relevé. Comparer les prix", "Indicative price, not tracked yet. Compare prices")}
      </button>
    );
  }
  const best = info.best?.[0];
  const t = trendOf(part.id);
  const en = currentLang() === "en";
  const num = (n: number) => n.toLocaleString(en ? "en-GB" : "fr-FR", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  const eur = (n: number) => (en ? `€${num(n)}` : `${num(n)} €`);
  const trend =
    t.change != null && t.change !== 0
      ? tr(
          `, ${t.change < 0 ? "en baisse" : "en hausse"} de ${Math.abs(t.change)} % depuis le relevé précédent`,
          `, ${t.change < 0 ? "down" : "up"} ${Math.abs(t.change)}% since the previous check`,
        )
      : "";
  return (
    <button className={`market small market-btn ${info.stale ? "stale" : ""}`} onClick={sheet} title={tr("Voir les offres, l'évolution du prix et créer une alerte", "See offers, price history and create an alert")}>
      {best
        ? tr(`Dès ${eur(best.price)} chez ${best.merchant}`, `From ${eur(best.price)} at ${best.merchant}`)
        : tr(`Prix médian de ${info.offers} marchands`, `Median price from ${info.offers} retailers`)}
      {trend}
      {info.stale ? tr(" (relevé ancien)", " (old check)") : ""}
      {watched ? tr(", prix surveillé", ", price watched") : ""}. <u>{tr("Voir les offres", "See offers")}</u>
    </button>
  );
}

const price = (p: Part) => ("price" in p && p.price != null ? p.price : 0);

// ---------------------------------------------------------------------------
// Questionnaire et résumé
// ---------------------------------------------------------------------------

/** Ce que PCEvolu ne peut pas lire, résumé en une phrase. */
function ProfileSentence({ p, answers, missing }: { p: Profile; answers: Answers; missing: number }) {
  if (missing >= 3) {
    return (
      <span>
        {tr(
          "PCEvolu ne peut pas lire ton alimentation, ton boîtier ni ton refroidissement : les pièces qui en dépendent sont marquées « à vérifier ».",
          "PCEvolu can't read your power supply, case or cooling: parts that depend on them are marked \"to check\".",
        )}
      </span>
    );
  }
  const parts = [
    p.psuKnown ? tr(`alimentation ${p.psuWatts} W`, `${p.psuWatts} W power supply`) : tr("alimentation inconnue", "unknown power supply"),
    p.gpuMaxMm ? tr(`cartes graphiques jusqu'à ${p.gpuMaxMm} mm`, `graphics cards up to ${p.gpuMaxMm} mm`) : tr("taille du boîtier inconnue", "unknown case size"),
    answers.caseFans != null
      ? tr(
          `${answers.caseFans >= 3 ? "3 ventilateurs ou plus" : `${answers.caseFans} ventilateur${answers.caseFans > 1 ? "s" : ""}`}`,
          answers.caseFans >= 3 ? "3 or more fans" : `${answers.caseFans} ${answers.caseFans === 1 ? "fan" : "fans"}`,
        )
      : tr("ventilateurs inconnus", "unknown fans"),
    answers.cooler !== "unknown" ? coolerLabel(answers.cooler).toLowerCase() : tr("ventirad inconnu", "unknown CPU cooler"),
  ];
  return <span>{tr("Ta config : ", "Your setup: ")}{parts.join(", ")}.</span>;
}



const COOLER_KEYS: Answers["cooler"][] = ["stock", "tower-single", "tower-dual", "aio-240", "aio-360", "unknown"];
const coolerLabel = (k: Answers["cooler"]): string =>
  ({
    stock: tr("Ventirad d'origine (livré avec le CPU)", "Stock cooler (came with the CPU)"),
    "tower-single": tr("Ventirad tour simple", "Single tower cooler"),
    "tower-dual": tr("Gros ventirad double tour", "Large dual tower cooler"),
    "aio-240": tr("Watercooling AIO 240 mm", "240 mm AIO liquid cooler"),
    "aio-360": tr("Watercooling AIO 280/360 mm", "280/360 mm AIO liquid cooler"),
    unknown: tr("Je ne sais pas", "I don't know"),
  })[k];

function Questionnaire({ a, update }: { a: Answers; update: (p: Partial<Answers>) => void }) {
  return (
    <div className="qform">
      <Field
        label={tr("Puissance de l'alimentation", "Power supply wattage")}
        hint={tr("Inscrite sur l'étiquette, sur le flanc de l'alim (ex. « 650W »).", "Printed on the label on the side of the power supply (e.g. \"650W\").")}
      >
        <select value={a.psuWatts ?? ""} onChange={(e) => update({ psuWatts: e.target.value ? Number(e.target.value) : null })}>
          <option value="">{tr("Je ne sais pas", "I don't know")}</option>
          {[400, 450, 500, 550, 600, 650, 700, 750, 850, 1000, 1200].map((w) => (
            <option key={w} value={w}>
              {w} W
            </option>
          ))}
        </select>
      </Field>
      <Field
        label={tr("Câble 16 broches (12V-2x6 / 12VHPWR)", "16-pin cable (12V-2x6 / 12VHPWR)")}
        hint={tr("Présent sur les alims ATX 3.0 et plus récentes.", "Found on ATX 3.0 and newer power supplies.")}
      >
        <select value={a.psu12v2x6} onChange={(e) => update({ psu12v2x6: e.target.value as Answers["psu12v2x6"] })}>
          <option value="unknown">{tr("Je ne sais pas", "I don't know")}</option>
          <option value="yes">{tr("Oui", "Yes")}</option>
          <option value="no">{tr("Non", "No")}</option>
        </select>
      </Field>
      <Field label={tr("Taille du boîtier", "Case size")} hint={tr("Sert à estimer la place pour la carte graphique.", "Used to estimate the room for the graphics card.")}>
        <select value={a.caseSize} onChange={(e) => update({ caseSize: e.target.value as Answers["caseSize"] })}>
          <option value="unknown">{tr("Je ne sais pas", "I don't know")}</option>
          <option value="small">{tr("Petit (mini-tour, Micro-ATX)", "Small (mini tower, Micro-ATX)")}</option>
          <option value="mid">{tr("Moyen tour (le plus courant)", "Mid tower (the most common)")}</option>
          <option value="full">{tr("Grand tour", "Full tower")}</option>
        </select>
      </Field>
      <Field
        label={tr("Longueur max de carte graphique (mm)", "Max graphics card length (mm)")}
        hint={tr("Facultatif, plus précis : voir la fiche de ton boîtier.", "Optional, more accurate: see your case's spec sheet.")}
      >
        <input
          type="number"
          min={150}
          max={500}
          placeholder={tr("ex. 330", "e.g. 330")}
          value={a.gpuMaxMm ?? ""}
          onChange={(e) => update({ gpuMaxMm: e.target.value ? Number(e.target.value) : null })}
        />
      </Field>
      <Field
        label={tr("Ventilateurs de boîtier", "Case fans")}
        hint={tr("Hors ventirad du processeur et ventilateurs de la carte graphique.", "Not counting the CPU cooler and the graphics card fans.")}
      >
        <select value={a.caseFans ?? ""} onChange={(e) => update({ caseFans: e.target.value === "" ? null : Number(e.target.value) })}>
          <option value="">{tr("Je ne sais pas", "I don't know")}</option>
          <option value="0">{tr("Aucun", "None")}</option>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">{tr("3 ou plus", "3 or more")}</option>
        </select>
      </Field>
      <Field label={tr("Refroidissement du processeur", "CPU cooling")}>
        <select value={a.cooler} onChange={(e) => update({ cooler: e.target.value as Answers["cooler"] })}>
          {COOLER_KEYS.map((k) => (
            <option key={k} value={k}>
              {coolerLabel(k)}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="muted small">{hint}</span>}
    </label>
  );
}
