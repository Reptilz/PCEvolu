import { T } from "../glossary";
import { useState, type ReactNode } from "react";
import type { Addition, Check, ModelPick, Part, Proposal, Role } from "./types";
import { slotOf, useSelection, type SlotCategory } from "./selection";
import { CheckRow, MarketLine } from "./UpgradesView";
import { usePrices } from "./PriceSheet";
import { partName } from "./catalog";
import { bestPriceOf, saveAlerts, suggestedTarget } from "./alerts";
import { isGaming, type Goal } from "./goal";
import { planTitle, type OptimizeResult, type Plan } from "./optimizer";
import { price } from "./engine";
import { BrandLogo, hasBrandLogo, Icon, type IconName } from "../icons";
import { openUrl } from "../platform";
import { tr } from "../settings";

/** Arrondit un coût au palier de budget supérieur (par 50 €). */
const roundBudget = (c: number) => Math.ceil(c / 50) * 50;

/** Un montant en euros : « 1234 € » en français, « €1,234 » en anglais. */
export const euros = (n: number) => tr(`${n} €`, `€${n.toLocaleString("en-GB")}`);

const kindNames = (): Record<Part["kind"], string> => ({
  cpu: tr("Processeur", "Processor"), board: tr("Carte mère", "Motherboard"), gpu: tr("Carte graphique", "Graphics card"),
  ram: tr("Mémoire", "Memory"), ssd: tr("Stockage", "Storage"),
  psu: tr("Alimentation", "Power supply"), cooler: tr("Ventirad", "CPU cooler"), fans: tr("Ventilateurs", "Fans"), case: tr("Boîtier", "Case"),
});
export const kindLabel = (p: Part) => kindNames()[p.kind];
const KIND_ICON: Record<Part["kind"], IconName> = {
  cpu: "chip", board: "board", gpu: "gpu", ram: "ram", ssd: "disk", psu: "power", cooler: "fan", fans: "fan", case: "tower",
};
export const kindIcon = (p: Part): IconName => KIND_ICON[p.kind];

const brandOfPart = (p: Part) => ("brand" in p ? (p.brand as string | undefined) : undefined);

/** Les icônes des pièces d'un achat, côte à côte : le logo du fabricant quand on le connaît (NVIDIA, AMD, Intel), sinon le type de pièce. */
export function KindIcons({ parts }: { parts: Part[] }) {
  const seen = new Set<string>();
  const marks: ReactNode[] = [];
  for (const p of parts) {
    const brand = brandOfPart(p);
    const key = hasBrandLogo(brand) ? `${p.kind}-${brand}` : p.kind;
    if (seen.has(key)) continue;
    seen.add(key);
    marks.push(hasBrandLogo(brand) ? <BrandLogo key={key} brand={brand} /> : <Icon key={key} name={KIND_ICON[p.kind]} />);
  }
  return <span className="kind-icons">{marks}</span>;
}

// ---------------------------------------------------------------------------
// Le plan conseillé (bloc principal de « Mon objectif »)
// ---------------------------------------------------------------------------

export function RecommendedPlan({ goal, result, onBudget, onDetails }: {
  goal: Goal;
  result: OptimizeResult;
  onBudget: (b: number | null) => void;
  onDetails: (tab: string) => void;
}) {
  const { current, best, cheapestReach, tiers } = result;
  const reachTooExpensive = cheapestReach && goal.budget != null && cheapestReach.cost > goal.budget;

  return (
    <section className="rec">
      <div className="rec-head">
        <h2>
          {current.reached
            ? tr("Rien à acheter", "Nothing to buy")
            : best?.evaluation.reached
              ? tr("Le plan conseillé", "The recommended plan")
              : tr("Le mieux dans ton budget", "The best within your budget")}
        </h2>
        <BudgetSlider value={goal.budget} onChange={onBudget} />
      </div>

      {current.reached ? (
        <p className="rec-empty">
          {tr("Ton PC atteint déjà ton objectif.", "Your PC already meets your goal.")}{" "}
          {tiers.length > 0 ? tr("Les onglets ci-dessous montrent ce qu'un budget apporterait en plus.", "The tabs below show what extra a budget would get you.") : ""}
        </p>
      ) : best ? (
        <PlanDetail plan={best} goal={goal} currentFps={current.fps} onDetails={onDetails} />
      ) : (
        <p className="rec-empty">
          {tr("Rien d'utile dans ce budget.", "Nothing useful within this budget.")}
          {tiers[0] ? tr(` Le premier pas coûte ${tiers[0].cost} € (${planTitle(tiers[0])}).`, ` The first step costs ${euros(tiers[0].cost)} (${planTitle(tiers[0])}).`) : ""}
        </p>
      )}

      {!current.reached && reachTooExpensive && (
        <p className="rec-reach">
          {tr(
            `Pour atteindre complètement ton objectif, il faut compter ${cheapestReach.cost} € (${planTitle(cheapestReach)}).`,
            `To fully reach your goal, expect to spend ${euros(cheapestReach.cost)} (${planTitle(cheapestReach)}).`,
          )}{" "}
          <button className="link" onClick={() => onBudget(roundBudget(cheapestReach.cost))}>
            {tr(`Passer le budget à ${roundBudget(cheapestReach.cost)} €`, `Raise the budget to ${euros(roundBudget(cheapestReach.cost))}`)}
          </button>
        </p>
      )}
      {!current.reached && !cheapestReach && (
        <p className="rec-reach">
          {tr(
            "Aucune combinaison du catalogue n'atteint complètement cet objectif : voici ce qui s'en approche le plus.",
            "No combination in the catalogue fully reaches this goal: here is what comes closest.",
          )}
        </p>
      )}
    </section>
  );
}

/** Détail d'un plan : résultat, liste d'achat, compatibilité résumée (dépliable), surveillance des prix. */
export function PlanDetail({ plan, goal, currentFps, onDetails, selectable = true }: { plan: Plan; goal: Goal; currentFps?: number; onDetails: (tab: string) => void; selectable?: boolean }) {
  const sel = useSelection();
  const chosen = (Object.entries(plan.choice) as [string, Proposal | undefined][]).every(([c, pr]) => !pr || sel.selection[c as SlotCategory] === slotOf(pr).id)
    && Object.keys(sel.selection).length === Object.values(plan.choice).filter(Boolean).length;
  const ev = plan.evaluation;
  const extras = plan.additions.filter((a) => a.role !== "recommended");
  const advised = plan.additions.filter((a) => a.role === "recommended");

  return (
    <div className="pd">
      <div className="pd-top">
        <div className="pd-title">{planTitle(plan)}</div>
        <div className="pd-price">{euros(plan.cost)}</div>
      </div>
      <p className="pd-sub">
        {isGaming(goal.usage) && ev.fps != null && currentFps != null
          ? ev.reached
            ? tr(
                `Environ ${ev.fps} i/s au lieu de ${currentFps} : ton objectif de ${goal.fps} i/s est atteint.`,
                `About ${ev.fps} fps instead of ${currentFps}: your goal of ${goal.fps} fps is reached.`,
              )
            : tr(
                `Environ ${ev.fps} i/s au lieu de ${currentFps}, pour un objectif de ${goal.fps} i/s.`,
                `About ${ev.fps} fps instead of ${currentFps}, for a goal of ${goal.fps} fps.`,
              )
          : ev.reached
            ? tr("Ton objectif est atteint.", "Your goal is reached.")
            : tr(
                `Ton PC atteindrait ${Math.round(Math.min(ev.score, 1) * 100)} % de l'objectif.`,
                `Your PC would reach ${Math.round(Math.min(ev.score, 1) * 100)}% of the goal.`,
              )}
        {plan.costIfVerify > plan.cost &&
          tr(
            ` Jusqu'à ${plan.costIfVerify} € si les pièces à vérifier sont nécessaires.`,
            ` Up to ${euros(plan.costIfVerify)} if the parts to check turn out to be needed.`,
          )}
      </p>

      <ul className="pd-items">
        {plan.items.map((it) => (
          <ItemRow key={it.id} kind={kindLabel(it.main)} part={it.main} amount={price(it.main) * it.mainQuantity} />
        ))}
        {extras.map((a, i) => (
          <AdditionRow key={i} a={a} />
        ))}
      </ul>

      {plan.checks && <CompatSummary checks={plan.checks} />}

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

      <div className="pd-actions">
        {selectable &&
          (chosen ? (
            <button className="btn sel-add" onClick={sel.open}>
              <Icon name="check" /> {tr("Plan choisi : voir ma sélection", "Plan chosen: see my selection")}
            </button>
          ) : (
            <button
              className="btn primary sel-add"
              onClick={() => {
                sel.replace(plan.choice);
                sel.open();
              }}
            >
              <Icon name="cart" /> {tr("Choisir ce plan", "Choose this plan")}
            </button>
          ))}
        <WatchPlan plan={plan} />
        {plan.items[0] && (
          <button className="link small" onClick={() => onDetails(plan.items[0].category)}>
            {tr("Explorer toutes les options compatibles", "Explore all compatible options")}
          </button>
        )}
      </div>
    </div>
  );
}

export function ItemRow({ kind, part, amount, children, note }: { kind: string; part: Part; amount: number; children?: ReactNode; note?: ReactNode }) {
  return (
    <li className="pd-item">
      <span className="pd-kind">
        <Icon name={KIND_ICON[part.kind]} className="pd-kind-ico" />
        {kind}
      </span>
      <div className="pd-what">
        <span className="pd-name">
          <BrandLogo brand={brandOfPart(part)} className="pd-brand" />
          {partName(part)}
        </span>
        {note}
        <MarketLine part={part} />
        {children}
      </div>
      <span className="pd-amount num">{euros(amount)}</span>
    </li>
  );
}

const roleNote = (r: Role): string =>
  ({ required: tr("Obligatoire", "Required"), verify: tr("À vérifier", "To check"), recommended: tr("Conseillé", "Recommended") })[r];

export function AdditionRow({ a }: { a: Addition }) {
  return (
    <ItemRow
      kind={kindLabel(a.part)}
      part={a.part}
      amount={price(a.part) * a.quantity}
      note={
        <span className={`pd-why role-${a.role}`}>
          {roleNote(a.role)}{tr(" : ", ": ")}<T>{a.reason.charAt(0).toLowerCase() + a.reason.slice(1)}</T>
        </span>
      }
    >
      {a.models?.length ? <ModelPicks models={a.models} /> : null}
    </ItemRow>
  );
}

/** Ajoute une proposition à « Ma sélection », la remplace dans sa catégorie, ou indique qu'elle y est déjà. */
export function SelectButton({ p }: { p: Proposal }) {
  const { selection, add, remove, open } = useSelection();
  const { slot, id } = slotOf(p);
  const current = selection[slot];
  if (current === id) {
    return (
      <div className="sel-state">
        <span className="sel-in">
          <Icon name="check" /> {tr("Dans ta sélection", "In your selection")}
        </span>
        <button className="link small" onClick={open}>
          {tr("Voir ma sélection", "See my selection")}
        </button>
        <button className="link small sel-remove" onClick={() => remove(slot)}>
          {tr("Retirer", "Remove")}
        </button>
      </div>
    );
  }
  const what = {
    gpu: tr("ta carte graphique", "your graphics card"),
    cpu: tr("ton processeur", "your processor"),
    ram: tr("ta mémoire", "your memory"),
    storage: tr("ton stockage", "your storage"),
  }[slot];
  return (
    <button className="btn sel-add" onClick={() => add(p)}>
      <Icon name="cart" />
      {current ? tr(`Remplacer ${what} dans ma sélection`, `Replace ${what} in my selection`) : tr("Ajouter à ma sélection", "Add to my selection")}
    </button>
  );
}

/** Modèles réels conseillés pour une pièce générique, avec ce qui les distingue et leur fiche chez le fabricant. */
export function ModelPicks({ models }: { models: ModelPick[] }) {
  return (
    <div className="picks">
      <span className="picks-title">
        {tr(
          "Modèles conseillés (prix de la catégorie, vérifie le prix du modèle) :",
          "Recommended models (category price, check the price of the exact model):",
        )}
      </span>
      <ul>
        {models.map((m) => (
          <li key={m.name}>
            <BrandLogo brand={m.name} className="picks-logo" />
            {m.url ? (
              <button className="picks-name" onClick={() => openUrl(m.url!)} title={tr("Ouvrir la fiche du fabricant", "Open the manufacturer's page")}>
                {m.name}
              </button>
            ) : (
              <span className="picks-name">{m.name}</span>
            )}
            <span className="picks-why">{m.why.join(", ")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Une ligne de synthèse ; la liste complète des contrôles s'ouvre à la demande. */
export function CompatSummary({ checks }: { checks: Check[] }) {
  const [open, setOpen] = useState(false);
  const n = (s: string) => checks.filter((c) => c.status === s).length;
  const warn = n("warn");
  const fail = n("fail");
  const fixed = n("fixed");
  const sentence = fail
    ? tr(`${fail} problème${fail > 1 ? "s" : ""} de compatibilité`, `${fail} compatibility ${fail > 1 ? "issues" : "issue"}`)
    : tr(
        `Compatible avec ta config${warn ? `, ${warn} point${warn > 1 ? "s" : ""} à vérifier toi-même` : ""}`,
        `Compatible with your setup${warn ? `, ${warn} ${warn > 1 ? "points" : "point"} to check yourself` : ""}`,
      );
  return (
    <div className={`compat ${fail ? "bad" : warn ? "warn" : "ok"}`}>
      <button className="compat-line" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Icon name={fail ? "cross" : warn ? "alert" : "check"} />
        <span>
          {sentence}
          <span className="muted">
            {" "}
            {tr(
              `(${checks.length} points contrôlés${fixed ? `, dont ${fixed} réglé${fixed > 1 ? "s" : ""} par les pièces ajoutées` : ""})`,
              `(${checks.length} points checked${fixed ? `, ${fixed} of them solved by the added parts` : ""})`,
            )}
          </span>
        </span>
        <Icon name="chevron" className={`chev ${open ? "open" : ""}`} />
      </button>
      {open && (
        <ul className="checks compat-list">
          {checks.map((c, i) => (
            <CheckRow key={i} c={c} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Crée d'un coup une alerte de prix pour chaque pièce du plan (5 % sous le meilleur prix actuel). */
function WatchPlan({ plan }: { plan: Plan }) {
  const { alerts, setAlerts } = usePrices();
  const parts = [...plan.items.map((it) => it.main), ...plan.additions.filter((a) => a.role === "required").map((a) => a.part)];
  const missing = parts.filter((p) => !alerts.some((a) => a.id === p.id));
  if (missing.length === 0)
    return (
      <p className="pd-watch muted small">
        {tr("Tu surveilles déjà les prix de ce plan (onglet Alertes prix).", "You're already watching the prices of this plan (Price alerts tab).")}
      </p>
    );
  const watch = () => {
    const now = new Date().toISOString();
    const next = [
      ...alerts,
      ...missing.map((p) => ({ id: p.id, name: p.name, target: suggestedTarget(p.id, price(p)), startPrice: bestPriceOf(p.id) ?? price(p), createdAt: now })),
    ];
    saveAlerts(next);
    setAlerts(next);
  };
  return (
    <div className="pd-watch">
      <button className="btn" onClick={watch}>
        <Icon name="bell" /> {tr("Me prévenir si ces prix baissent", "Let me know if these prices drop")}
      </button>
      <span className="muted small">
        {tr(
          `Une alerte à −5 % sur ${missing.length === 1 ? "la pièce" : `chacune des ${missing.length} pièces`}.`,
          `An alert at −5% on ${missing.length === 1 ? "the part" : `each of the ${missing.length} parts`}.`,
        )}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Autres options et paliers (onglets sous le plan conseillé)
// ---------------------------------------------------------------------------

export function Alternatives({ result, goal, onDetails }: { result: OptimizeResult; goal: Goal; onDetails: (tab: string) => void }) {
  const { alternatives, current } = result;
  if (alternatives.length === 0) return <p className="muted">{tr("Pas d'autre option pertinente dans ce budget.", "No other relevant option within this budget.")}</p>;
  return (
    <ul className="rows">
      {alternatives.map((a, i) => (
        <PlanRow key={i} plan={a} goal={goal} currentFps={current.fps} onDetails={onDetails} />
      ))}
    </ul>
  );
}

export function Tiers({ result, goal, onBudget, onDetails }: { result: OptimizeResult; goal: Goal; onBudget: (b: number | null) => void; onDetails: (tab: string) => void }) {
  const { tiers, current } = result;
  if (tiers.length === 0) return <p className="muted">{tr("Aucune amélioration utile trouvée pour cet objectif.", "No useful upgrade found for this goal.")}</p>;
  return (
    <>
      <p className="muted tab-intro">
        {tr("Chaque ligne fait nettement mieux que toutes celles qui coûtent moins cher.", "Each row does clearly better than every cheaper one.")}
      </p>
      <ul className="rows">
        {tiers.map((t, i) => (
          <PlanRow
            key={i}
            plan={t}
            goal={goal}
            currentFps={current.fps}
            onDetails={onDetails}
            action={
              goal.budget != null && t.cost > goal.budget ? (
                <button className="link small" onClick={() => onBudget(roundBudget(t.cost))}>
                  {tr(`Budget ${roundBudget(t.cost)} €`, `Budget ${euros(roundBudget(t.cost))}`)}
                </button>
              ) : undefined
            }
          />
        ))}
      </ul>
    </>
  );
}

/** Ligne repliée (titre, effet, prix) ; un clic déplie le détail complet du plan. */
function PlanRow({ plan, goal, currentFps, onDetails, action }: { plan: Plan; goal: Goal; currentFps?: number; onDetails: (tab: string) => void; action?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ev = plan.evaluation;
  const effect =
    ev.fps != null && currentFps != null
      ? ev.fps > currentFps
        ? tr(`${currentFps} → ${ev.fps} i/s`, `${currentFps} → ${ev.fps} fps`)
        : tr(`${currentFps} i/s, un frein en moins`, `${currentFps} fps, one bottleneck less`)
      : tr(`${Math.round(Math.min(ev.score, 1) * 100)} % de l'objectif`, `${Math.round(Math.min(ev.score, 1) * 100)}% of the goal`);
  return (
    <li className={`row ${open ? "open" : ""}`}>
      <button className="row-line" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="row-title">
          <KindIcons parts={[...plan.items.map((it) => it.main), ...plan.additions.filter((a) => a.role === "required").map((a) => a.part)]} />
          {planTitle(plan)}
        </span>
        <span className="row-effect">
          {effect}
          {ev.reached && <span className="row-ok">{tr(", objectif atteint", ", goal reached")}</span>}
        </span>
        <span className="row-price num">{euros(plan.cost)}</span>
        <Icon name="chevron" className={`chev ${open ? "open" : ""}`} />
      </button>
      {action && !open && <div className="row-action">{action}</div>}
      {open && (
        <div className="row-detail">
          <PlanDetail plan={plan} goal={goal} currentFps={currentFps} onDetails={onDetails} />
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------

export function BudgetSlider({ value, onChange }: { value: number | null; onChange: (b: number | null) => void }) {
  const [local, setLocal] = useState<number>(value ?? 3000);
  return (
    <div className="budget-inline">
      <label htmlFor="budget-range">{tr("Budget", "Budget")}</label>
      <input
        id="budget-range"
        type="range"
        min={0}
        max={3000}
        step={50}
        value={value ?? local}
        onChange={(e) => {
          setLocal(Number(e.target.value));
          onChange(Number(e.target.value));
        }}
      />
      <b className="num">{value == null ? tr("libre", "no limit") : euros(value)}</b>
      <button className="link small" onClick={() => onChange(value == null ? local : null)}>
        {value == null ? tr("Fixer", "Set") : tr("Sans limite", "No limit")}
      </button>
    </div>
  );
}
