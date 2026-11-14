import { T } from "../glossary";
import { useState, type ReactNode } from "react";
import type { Addition, Check, Part, Role } from "./types";
import { CheckRow, MarketLine } from "./UpgradesView";
import { usePrices } from "./PriceSheet";
import { bestPriceOf, saveAlerts, suggestedTarget } from "./alerts";
import { isGaming, type Goal } from "./goal";
import { planTitle, type OptimizeResult, type Plan } from "./optimizer";
import { price } from "./engine";
import { Icon } from "../icons";

/** Arrondit un coût au palier de budget supérieur (par 50 €). */
const roundBudget = (c: number) => Math.ceil(c / 50) * 50;

const KIND: Record<Part["kind"], string> = {
  cpu: "Processeur", board: "Carte mère", gpu: "Carte graphique", ram: "Mémoire", ssd: "Stockage",
  psu: "Alimentation", cooler: "Ventirad", fans: "Ventilateurs", case: "Boîtier",
};
export const kindLabel = (p: Part) => KIND[p.kind];

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
        <h2>{current.reached ? "Rien à acheter" : best?.evaluation.reached ? "Le plan conseillé" : "Le mieux dans ton budget"}</h2>
        <BudgetSlider value={goal.budget} onChange={onBudget} />
      </div>

      {current.reached ? (
        <p className="rec-empty">
          Ton PC atteint déjà ton objectif. {tiers.length > 0 ? "Les onglets ci-dessous montrent ce qu'un budget apporterait en plus." : ""}
        </p>
      ) : best ? (
        <PlanDetail plan={best} goal={goal} currentFps={current.fps} onDetails={onDetails} />
      ) : (
        <p className="rec-empty">
          Rien d'utile dans ce budget.{tiers[0] ? ` Le premier pas coûte ${tiers[0].cost} € (${planTitle(tiers[0])}).` : ""}
        </p>
      )}

      {!current.reached && reachTooExpensive && (
        <p className="rec-reach">
          Pour atteindre complètement ton objectif, il faut compter {cheapestReach.cost} € ({planTitle(cheapestReach)}).{" "}
          <button className="link" onClick={() => onBudget(roundBudget(cheapestReach.cost))}>
            Passer le budget à {roundBudget(cheapestReach.cost)} €
          </button>
        </p>
      )}
      {!current.reached && !cheapestReach && (
        <p className="rec-reach">Aucune combinaison du catalogue n'atteint complètement cet objectif : voici ce qui s'en approche le plus.</p>
      )}
    </section>
  );
}

/** Détail d'un plan : résultat, liste d'achat, compatibilité résumée (dépliable), surveillance des prix. */
export function PlanDetail({ plan, goal, currentFps, onDetails }: { plan: Plan; goal: Goal; currentFps?: number; onDetails: (tab: string) => void }) {
  const ev = plan.evaluation;
  const extras = plan.additions.filter((a) => a.role !== "recommended");
  const advised = plan.additions.filter((a) => a.role === "recommended");

  return (
    <div className="pd">
      <div className="pd-top">
        <div className="pd-title">{planTitle(plan)}</div>
        <div className="pd-price">{plan.cost} €</div>
      </div>
      <p className="pd-sub">
        {isGaming(goal.usage) && ev.fps != null && currentFps != null
          ? ev.reached
            ? `Environ ${ev.fps} i/s au lieu de ${currentFps} : ton objectif de ${goal.fps} i/s est atteint.`
            : `Environ ${ev.fps} i/s au lieu de ${currentFps}, pour un objectif de ${goal.fps} i/s.`
          : ev.reached
            ? "Ton objectif est atteint."
            : `Ton PC atteindrait ${Math.round(Math.min(ev.score, 1) * 100)} % de l'objectif.`}
        {plan.costIfVerify > plan.cost && ` Jusqu'à ${plan.costIfVerify} € si les pièces à vérifier sont nécessaires.`}
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
          <summary>Conseillé en plus ({advised.length})</summary>
          <ul className="pd-items">
            {advised.map((a, i) => (
              <AdditionRow key={i} a={a} />
            ))}
          </ul>
        </details>
      )}

      <div className="pd-actions">
        <WatchPlan plan={plan} />
        {plan.items[0] && (
          <button className="link small" onClick={() => onDetails(plan.items[0].category)}>
            Explorer toutes les options compatibles
          </button>
        )}
      </div>
    </div>
  );
}

export function ItemRow({ kind, part, amount, children, note }: { kind: string; part: Part; amount: number; children?: ReactNode; note?: ReactNode }) {
  return (
    <li className="pd-item">
      <span className="pd-kind">{kind}</span>
      <div className="pd-what">
        <span className="pd-name">{part.name}</span>
        {note}
        <MarketLine part={part} />
        {children}
      </div>
      <span className="pd-amount num">{amount} €</span>
    </li>
  );
}

const ROLE_NOTE: Record<Role, string> = { required: "Obligatoire", verify: "À vérifier", recommended: "Conseillé" };

export function AdditionRow({ a }: { a: Addition }) {
  return (
    <ItemRow
      kind={kindLabel(a.part)}
      part={a.part}
      amount={price(a.part) * a.quantity}
      note={
        <span className={`pd-why role-${a.role}`}>
          {ROLE_NOTE[a.role]} : <T>{a.reason.charAt(0).toLowerCase() + a.reason.slice(1)}</T>
        </span>
      }
    />
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
    ? `${fail} problème${fail > 1 ? "s" : ""} de compatibilité`
    : `Compatible avec ta config${warn ? `, ${warn} point${warn > 1 ? "s" : ""} à vérifier toi-même` : ""}`;
  return (
    <div className={`compat ${fail ? "bad" : warn ? "warn" : "ok"}`}>
      <button className="compat-line" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Icon name={fail ? "cross" : warn ? "alert" : "check"} />
        <span>
          {sentence}
          <span className="muted">
            {" "}
            ({checks.length} points contrôlés{fixed ? `, dont ${fixed} réglé${fixed > 1 ? "s" : ""} par les pièces ajoutées` : ""})
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
  if (missing.length === 0) return <p className="pd-watch muted small">Tu surveilles déjà les prix de ce plan (onglet Alertes prix).</p>;
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
        <Icon name="bell" /> Me prévenir si ces prix baissent
      </button>
      <span className="muted small">Une alerte à −5 % sur {missing.length === 1 ? "la pièce" : `chacune des ${missing.length} pièces`}.</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Autres options et paliers (onglets sous le plan conseillé)
// ---------------------------------------------------------------------------

export function Alternatives({ result, goal, onDetails }: { result: OptimizeResult; goal: Goal; onDetails: (tab: string) => void }) {
  const { alternatives, current } = result;
  if (alternatives.length === 0) return <p className="muted">Pas d'autre option pertinente dans ce budget.</p>;
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
  if (tiers.length === 0) return <p className="muted">Aucune amélioration utile trouvée pour cet objectif.</p>;
  return (
    <>
      <p className="muted tab-intro">Chaque ligne fait nettement mieux que toutes celles qui coûtent moins cher.</p>
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
                  Budget {roundBudget(t.cost)} €
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
        ? `${currentFps} → ${ev.fps} i/s`
        : `${currentFps} i/s, un frein en moins`
      : `${Math.round(Math.min(ev.score, 1) * 100)} % de l'objectif`;
  return (
    <li className={`row ${open ? "open" : ""}`}>
      <button className="row-line" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="row-title">{planTitle(plan)}</span>
        <span className="row-effect">
          {effect}
          {ev.reached && <span className="row-ok">, objectif atteint</span>}
        </span>
        <span className="row-price num">{plan.cost} €</span>
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
      <label htmlFor="budget-range">Budget</label>
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
      <b className="num">{value == null ? "libre" : `${value} €`}</b>
      <button className="link small" onClick={() => onChange(value == null ? local : null)}>
        {value == null ? "Fixer" : "Sans limite"}
      </button>
    </div>
  );
}
