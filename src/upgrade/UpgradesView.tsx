import { T } from "../glossary";
import { useMemo, useState, type ReactNode } from "react";
import type { Report } from "../types";
import type { Category, Check, Part, Proposal } from "./types";
import { buildProfile, missingAnswers, saveAnswers, type Answers, type Profile } from "./profile";
import { proposeAll } from "./engine";
import { CATALOG_DATE } from "./catalog";
import { priceInfo, pricesFile, trendOf } from "./prices";
import { usePrices } from "./PriceSheet";
import { Icon, type IconName } from "../icons";
import { impactOf, type Goal, type Impact, type Verdict } from "./goal";
import { AdditionRow, CompatSummary, ItemRow, KindIcons, kindLabel } from "./PlanView";
import { goalSentence } from "./GoalViews";

const TABS: { id: Category; label: string; icon: IconName }[] = [
  { id: "gpu", label: "Carte graphique", icon: "gpu" },
  { id: "cpu", label: "Processeur", icon: "chip" },
  { id: "ram", label: "Mémoire vive", icon: "ram" },
  { id: "storage", label: "Stockage", icon: "disk" },
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

  // Chaque proposition est évaluée face à l'objectif : gain réel, objectif atteint, budget.
  const scored: Scored[] = useMemo(
    () =>
      all[tab].map((p) => ({
        p,
        impact: impactOf(goal, profile, verdict, p.main as never, tab, ramAfter(p, profile.ramTotalGb)),
        inBudget: goal.budget == null || p.total <= goal.budget,
      })),
    [all, tab, goal, profile, verdict],
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

  const tabCount = (id: Category) => all[id].length;
  const blocking = (id: Category) => verdict.needs.some((n) => n.fix === id && n.status !== "ok");
  const advice = !goal.configured
    ? undefined
    : tabNeed
      ? cheapestGoal
        ? `${tabNeed.detail} La solution la moins chère pour atteindre ton objectif coûte ${cheapestGoal.p.total} €${goal.budget != null && cheapestGoal.p.total > goal.budget ? `, au-delà de ton budget de ${goal.budget} €` : ""}.`
        : `${tabNeed.detail} Aucune pièce de cet onglet ne suffit seule : le plan combiné de « Mon objectif » associe plusieurs pièces.`
      : verdict.level === "ok"
        ? "Ton PC atteint déjà ton objectif : tout ce qui suit est du bonus."
        : "Cette pièce ne limite pas ton objectif. Les onglets marqués d'un point sont prioritaires.";

  return (
    <div className="up-page">
      <header className="gp-head">
        <div>
          <h1>Toutes les pièces</h1>
          <p className="gp-goal">Le catalogue complet des pièces compatibles avec ton PC, vérifiées une par une. Pour un conseil tout prêt, va dans Mon plan.</p>
        </div>
      </header>

      <div className="up-context">
        <p>
          {goal.configured ? (
            <>
              Objectif : {goalSentence(goal).charAt(0).toLowerCase() + goalSentence(goal).slice(1)}
              {verdict.fps ? `, avec environ ${verdict.fps.fps} i/s aujourd'hui` : ""}.{" "}
            </>
          ) : (
            "Aucun objectif défini : les propositions ne sont pas classées selon ton usage. "
          )}
          <button className="link" onClick={onEditGoal}>
            {goal.configured ? "Modifier l'objectif" : "Définir mon objectif"}
          </button>
        </p>
        <p>
          <ProfileSentence p={profile} answers={answers} missing={missing} />{" "}
          <button className="link" onClick={() => setShowForm(!showForm)}>
            {showForm ? "Fermer" : missing > 0 ? "Renseigner ces infos" : "Modifier"}
          </button>
        </p>
        {showForm && (
          <div className="up-form">
            <Questionnaire a={answers} update={update} />
          </div>
        )}
      </div>

      <div className="seg up-seg" role="tablist">
        {TABS.map((t) => (
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
            {blocking(t.id) && <span className="tab-dot" title="Limite ton objectif" />}
            {t.label}
            <span className="seg-count">{tabCount(t.id)}</span>
          </button>
        ))}
      </div>

      {advice && all[tab].length > 0 && <p className={`up-advice ${tabNeed ? "need" : ""}`}>{advice}</p>}

      {brands.length > 1 && (
        <div className="brand-filter">
          <span className="muted small">Marque</span>
          {["all", ...brands.sort()].map((b) => (
            <button key={b} className={`chip-btn ${brand === b ? "on" : ""}`} onClick={() => setBrand(b)}>
              {b === "all" ? "Toutes" : b}
            </button>
          ))}
        </div>
      )}

      {all[tab].length === 0 ? (
        <p className="up-empty">{emptyMessage(tab, profile)}</p>
      ) : (
        <>
          {inBudget.length === 0 && goal.budget != null && <p className="up-empty">Rien dans cet onglet ne rentre dans ton budget de {goal.budget} €.</p>}
          <ul className="rows">
            {inBudget.map((s) => (
              <ProposalRow key={s.p.id} p={s.p} impact={goal.configured ? s.impact : undefined} />
            ))}
          </ul>
          {over.length > 0 && (
            <div className="over-budget">
              <button className="link" onClick={() => setShowOver(!showOver)}>
                {showOver ? "Masquer" : "Afficher"} {over.length === 1 ? "la proposition" : `les ${over.length} propositions`} au-delà de ton budget
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
      <p className="muted small up-foot">
        {marketCount > 0
          ? `Prix du marché relevés le ${new Date(market!.updatedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} sur Google Shopping (médiane des marchands, ${marketCount} composants). Les autres prix sont indicatifs (${CATALOG_DATE}).`
          : `Prix indicatifs (${CATALOG_DATE}).`}{" "}
        Les performances sont des ordres de grandeur : vérifie toujours la fiche du modèle exact avant d'acheter. PCEvolu n'a aucun lien commercial avec les marchands cités.
      </p>
    </div>
  );
}



function emptyMessage(tab: Category, p: Profile) {
  if (p.isLaptop && (tab === "gpu" || tab === "cpu"))
    return "Sur un PC portable, le processeur et la carte graphique sont soudés à la carte mère : impossible de les changer. Les gains possibles passent par la RAM et le stockage.";
  if (p.isLaptop && tab === "ram")
    return "PC portable : la RAM est au format SO-DIMM, et souvent soudée sur les modèles récents. Vérifie dans la fiche de ton modèle s'il reste un emplacement libre.";
  if (tab === "ram" && p.ramType === "DDR3")
    return "Ton PC utilise de la DDR3, qui n'est plus vendue neuve. Plutôt que d'en racheter, mieux vaut investir dans une nouvelle plateforme (onglet Processeur).";
  if (tab === "gpu" && !p.gpu) return "Ta carte graphique n'a pas été reconnue : impossible de calculer un gain fiable.";
  if (tab === "cpu" && !p.cpu) return "Ton processeur n'a pas été reconnu.";
  if (tab === "ram" && !p.ramType) return "Type de mémoire non détecté.";
  return "Aucun upgrade pertinent dans le catalogue pour l'instant : ce composant est déjà au niveau.";
}

// ---------------------------------------------------------------------------
// Carte de proposition
// ---------------------------------------------------------------------------


export function CheckRow({ c }: { c: Check }) {
  const icon = c.status === "ok" ? "check" : c.status === "warn" ? "alert" : c.status === "fixed" ? "refresh" : "cross";
  return (
    <li className={`chk c-${c.status}`}>
      <Icon name={icon} />
      <div>
        <div className="chk-label">{c.label}</div>
        <div className="chk-detail"><T>{c.detail}</T></div>
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
    ? `avec ${required.map((a) => kindLabel(a.part).toLowerCase()).join(" et ")} en plus`
    : fails
      ? "incompatible"
      : warns
        ? `compatible, ${warns} point${warns > 1 ? "s" : ""} à vérifier`
        : "compatible tel quel";
  const effect = impact?.label ?? p.gainLabel;
  const flag = impact?.reachesGoal ? "Atteint ton objectif" : impact && !impact.relevant ? "Peu utile pour ton objectif" : p.highlight;

  return (
    <li className={`row prop-row ${open ? "open" : ""}`}>
      <button className="row-line" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="row-main">
          <span className="row-title">
            <KindIcons parts={[p.main, ...required.map((a) => a.part)]} />
            {p.title}
            {flag && <span className={`row-flag ${impact?.reachesGoal ? "ok" : impact && !impact.relevant ? "dim" : ""}`}>{flag}</span>}
          </span>
          <span className="row-sub">
            {effect ? `${effect.charAt(0).toUpperCase()}${effect.slice(1)}, ` : ""}
            {compat}.
          </span>
        </span>
        <span className="row-price num">
          {p.total} €{p.totalIfVerify > p.total && <span className="row-price-max">jusqu'à {p.totalIfVerify} €</span>}
        </span>
        <Icon name="chevron" className={`chev ${open ? "open" : ""}`} />
      </button>
      {open && (
        <div className="row-detail pd">
          <ul className="pd-items">
            <ItemRow kind={kindLabel(p.main)} part={p.main} amount={price(p.main) * p.mainQuantity} />
            {extras.map((a, i) => (
              <AdditionRow key={i} a={a} />
            ))}
          </ul>
          <CompatSummary checks={p.checks} />
          {advised.length > 0 && (
            <details className="pd-advised">
              <summary>Conseillé en plus ({advised.length})</summary>
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
        Prix indicatif, pas encore relevé. Comparer les prix
      </button>
    );
  }
  const best = info.best?.[0];
  const t = trendOf(part.id);
  const eur = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  const trend = t.change != null && t.change !== 0 ? `, ${t.change < 0 ? "en baisse" : "en hausse"} de ${Math.abs(t.change)} % depuis le relevé précédent` : "";
  return (
    <button className={`market small market-btn ${info.stale ? "stale" : ""}`} onClick={sheet} title="Voir les offres, l'évolution du prix et créer une alerte">
      {best ? `Dès ${eur(best.price)} € chez ${best.merchant}` : `Prix médian de ${info.offers} marchands`}
      {trend}
      {info.stale ? " (relevé ancien)" : ""}
      {watched ? ", prix surveillé" : ""}. <u>Voir les offres</u>
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
        PCEvolu ne peut pas lire ton alimentation, ton boîtier ni ton refroidissement : les pièces qui en dépendent sont marquées « à vérifier ».
      </span>
    );
  }
  const parts = [
    p.psuKnown ? `alimentation ${p.psuWatts} W` : "alimentation inconnue",
    p.gpuMaxMm ? `cartes graphiques jusqu'à ${p.gpuMaxMm} mm` : "taille du boîtier inconnue",
    answers.caseFans != null ? `${answers.caseFans >= 3 ? "3 ventilateurs ou plus" : `${answers.caseFans} ventilateur${answers.caseFans > 1 ? "s" : ""}`}` : "ventilateurs inconnus",
    answers.cooler !== "unknown" ? COOLER_LABEL[answers.cooler].toLowerCase() : "ventirad inconnu",
  ];
  return <span>Ta config : {parts.join(", ")}.</span>;
}



const COOLER_LABEL: Record<Answers["cooler"], string> = {
  stock: "Ventirad d'origine (livré avec le CPU)",
  "tower-single": "Ventirad tour simple",
  "tower-dual": "Gros ventirad double tour",
  "aio-240": "Watercooling AIO 240 mm",
  "aio-360": "Watercooling AIO 280/360 mm",
  unknown: "Je ne sais pas",
};

function Questionnaire({ a, update }: { a: Answers; update: (p: Partial<Answers>) => void }) {
  return (
    <div className="qform">
      <Field label="Puissance de l'alimentation" hint="Inscrite sur l'étiquette, sur le flanc de l'alim (ex. « 650W »).">
        <select value={a.psuWatts ?? ""} onChange={(e) => update({ psuWatts: e.target.value ? Number(e.target.value) : null })}>
          <option value="">Je ne sais pas</option>
          {[400, 450, 500, 550, 600, 650, 700, 750, 850, 1000, 1200].map((w) => (
            <option key={w} value={w}>
              {w} W
            </option>
          ))}
        </select>
      </Field>
      <Field label="Câble 16 broches (12V-2x6 / 12VHPWR)" hint="Présent sur les alims ATX 3.0 et plus récentes.">
        <select value={a.psu12v2x6} onChange={(e) => update({ psu12v2x6: e.target.value as Answers["psu12v2x6"] })}>
          <option value="unknown">Je ne sais pas</option>
          <option value="yes">Oui</option>
          <option value="no">Non</option>
        </select>
      </Field>
      <Field label="Taille du boîtier" hint="Sert à estimer la place pour la carte graphique.">
        <select value={a.caseSize} onChange={(e) => update({ caseSize: e.target.value as Answers["caseSize"] })}>
          <option value="unknown">Je ne sais pas</option>
          <option value="small">Petit (mini-tour, Micro-ATX)</option>
          <option value="mid">Moyen tour (le plus courant)</option>
          <option value="full">Grand tour</option>
        </select>
      </Field>
      <Field label="Longueur max de carte graphique (mm)" hint="Facultatif, plus précis : voir la fiche de ton boîtier.">
        <input
          type="number"
          min={150}
          max={500}
          placeholder="ex. 330"
          value={a.gpuMaxMm ?? ""}
          onChange={(e) => update({ gpuMaxMm: e.target.value ? Number(e.target.value) : null })}
        />
      </Field>
      <Field label="Ventilateurs de boîtier" hint="Hors ventirad du processeur et ventilateurs de la carte graphique.">
        <select value={a.caseFans ?? ""} onChange={(e) => update({ caseFans: e.target.value === "" ? null : Number(e.target.value) })}>
          <option value="">Je ne sais pas</option>
          <option value="0">Aucun</option>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3 ou plus</option>
        </select>
      </Field>
      <Field label="Refroidissement du processeur">
        <select value={a.cooler} onChange={(e) => update({ cooler: e.target.value as Answers["cooler"] })}>
          {(Object.keys(COOLER_LABEL) as Answers["cooler"][]).map((k) => (
            <option key={k} value={k}>
              {COOLER_LABEL[k]}
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
