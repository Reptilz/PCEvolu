import { useState } from "react";
import type { Addition, Part } from "./types";
import { isGaming, type Goal } from "./goal";
import { planTitle, type OptimizeResult, type Plan } from "./optimizer";
import { price } from "./engine";
import { priceInfo } from "./prices";
import { Icon } from "../icons";

/** Arrondit un coût au palier de budget supérieur (par 50 €). */
const roundBudget = (c: number) => Math.ceil(c / 50) * 50;

export function PlanSection({ goal, result, onBudget, onDetails }: {
  goal: Goal;
  result: OptimizeResult;
  onBudget: (b: number | null) => void;
  onDetails: (tab: string) => void;
}) {
  const { current, best, cheapestReach, tiers } = result;
  const reachTooExpensive = cheapestReach && goal.budget != null && cheapestReach.cost > goal.budget;

  return (
    <section className="plan">
      <div className="plan-head">
        <h2>Mon plan d'évolution</h2>
        <BudgetSlider value={goal.budget} onChange={onBudget} />
      </div>

      {current.reached ? (
        <div className="plan-empty ok">
          <Icon name="check" />
          <div>
            <b>Ton PC atteint déjà ton objectif : aucune dépense nécessaire.</b>
            <span className="muted">{tiers.length > 0 ? "Si tu veux aller plus loin, voici ce que chaque budget apporte :" : "Rien d'utile à ajouter pour cet usage."}</span>
          </div>
        </div>
      ) : best ? (
        <PlanCard plan={best} goal={goal} currentFps={current.fps} recommended onDetails={onDetails} />
      ) : (
        <div className="plan-empty">
          <Icon name="alert" />
          <div>
            <b>Aucune amélioration utile dans ce budget.</b>
            {tiers[0] && <span className="muted">Le premier pas coûte {tiers[0].cost} € : {planTitle(tiers[0])}.</span>}
          </div>
        </div>
      )}

      {!current.reached && reachTooExpensive && (
        <div className="plan-reach">
          <span>
            Pour atteindre complètement ton objectif, compte <b>≈ {cheapestReach.cost} €</b> : {planTitle(cheapestReach)}.
          </span>
          <button className="btn" onClick={() => onBudget(roundBudget(cheapestReach.cost))}>
            Passer à {roundBudget(cheapestReach.cost)} €
          </button>
        </div>
      )}
      {!current.reached && !cheapestReach && (
        <div className="plan-reach">
          <span>Aucune combinaison du catalogue n'atteint complètement cet objectif : l'app te propose ce qui s'en approche le plus.</span>
        </div>
      )}

      {tiers.length > 0 && (
        <>
          <h3 className="tiers-title">Ce que chaque budget apporte</h3>
          <ol className="tiers">
            {tiers.map((t, i) => {
              const inBudget = goal.budget == null || t.cost <= goal.budget;
              const isBest = best === t;
              return (
                <li key={i} className={`tier ${inBudget ? "" : "over"} ${isBest ? "best" : ""}`}>
                  <div className="tier-cost mono">{t.cost} €</div>
                  <div className="tier-main">
                    <div className="tier-title">{planTitle(t)}</div>
                    <div className="muted small">
                      {t.evaluation.fps != null && current.fps != null
                        ? t.evaluation.fps > current.fps
                          ? `≈ ${current.fps} → ${t.evaluation.fps} i/s`
                          : `≈ ${current.fps} i/s inchangés (${t.evaluation.limit === "gpu" ? "la carte graphique limite encore" : "le processeur limite encore"}), mais un frein en moins pour la suite`
                        : `${Math.round(Math.min(t.evaluation.score, 1) * 100)} % de l'objectif`}
                      {t.additions.some((a) => a.role === "required") &&
                        ` · avec ${t.additions.filter((a) => a.role === "required").map((a) => kindLabel(a.part)).join(", ")}`}
                    </div>
                  </div>
                  {t.evaluation.reached && <span className="tier-ok">✓ Objectif</span>}
                  {!inBudget && (
                    <button className="link" onClick={() => onBudget(roundBudget(t.cost))}>
                      Budget {roundBudget(t.cost)} €
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}

function PlanCard({ plan, goal, currentFps, recommended, onDetails }: { plan: Plan; goal: Goal; currentFps?: number; recommended?: boolean; onDetails: (tab: string) => void }) {
  const [open, setOpen] = useState(true);
  const ev = plan.evaluation;
  const req = plan.additions.filter((a) => a.role === "required");
  const ver = plan.additions.filter((a) => a.role === "verify");
  const rec = plan.additions.filter((a) => a.role === "recommended");

  return (
    <div className={`plan-card ${ev.reached ? "reached" : ""}`}>
      <div className="plan-card-head" onClick={() => setOpen(!open)}>
        <div>
          {recommended && <div className="prop-hl">{ev.reached ? "Le moins cher pour atteindre ton objectif" : "Le meilleur dans ton budget"}</div>}
          <div className="plan-title">{planTitle(plan)}</div>
          <div className="plan-result">
            {isGaming(goal.usage) && ev.fps != null ? (
              <>
                ≈ {currentFps} → <b>{ev.fps} i/s</b> {ev.reached ? <span className="ok-text">✓ objectif {goal.fps} i/s atteint</span> : <span className="muted">sur {goal.fps} i/s visés</span>}
              </>
            ) : ev.reached ? (
              <span className="ok-text">✓ Objectif atteint</span>
            ) : (
              <span className="muted">{Math.round(Math.min(ev.score, 1) * 100)} % de l'objectif</span>
            )}
          </div>
        </div>
        <div className="prop-price">
          <div className="prop-total">{plan.cost} €</div>
          {plan.costIfVerify > plan.cost && <div className="muted small">jusqu'à {plan.costIfVerify} € selon vérifications</div>}
        </div>
        <Icon name="chevron" className={`chev ${open ? "open" : ""}`} />
      </div>

      {open && (
        <div className="plan-body">
          <ul className="cart">
            {plan.items.map((it) => (
              <li key={it.id} className="cart-main">
                <div className="cart-line">
                  <span>
                    {kindLabel(it.main)} · {it.main.name}
                  </span>
                  <span className="mono">{price(it.main)} €</span>
                </div>
                <div className="small">
                  <span className="muted">{priceInfo(it.main.id) ? `Prix du marché (${priceInfo(it.main.id)!.offers} marchands)` : "Prix indicatif"}</span>
                  {" · "}
                  <button className="link small" onClick={() => onDetails(it.category)}>
                    Voir la compatibilité
                  </button>
                </div>
              </li>
            ))}
            <AddGroup title="À ajouter obligatoirement" cls="r-req" items={req} />
            <AddGroup title="Probablement nécessaire, à vérifier" cls="r-ver" items={ver} />
            <AddGroup title="Conseillé" cls="r-rec" items={rec} />
            <li className="cart-total">
              <span>Total obligatoire</span>
              <span className="mono">{plan.cost} €</span>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

function AddGroup({ title, cls, items }: { title: string; cls: string; items: Addition[] }) {
  if (items.length === 0) return null;
  return (
    <li className="cart-group">
      <div className={`cart-role ${cls}`}>{title}</div>
      {items.map((a, i) => (
        <div key={i} className="cart-add">
          <div className="cart-line">
            <span>
              {kindLabel(a.part)} · {a.part.name}
            </span>
            <span className="mono">{price(a.part) * a.quantity} €</span>
          </div>
          <div className="muted small">{a.reason}</div>
        </div>
      ))}
    </li>
  );
}

const KIND: Record<Part["kind"], string> = {
  cpu: "Processeur", board: "Carte mère", gpu: "Carte graphique", ram: "RAM", ssd: "SSD",
  psu: "Alimentation", cooler: "Ventirad", fans: "Ventilateurs", case: "Boîtier",
};
const kindLabel = (p: Part) => KIND[p.kind];

export function BudgetSlider({ value, onChange }: { value: number | null; onChange: (b: number | null) => void }) {
  const [local, setLocal] = useState<number>(value ?? 3000);
  return (
    <div className="budget-inline">
      <span className="muted small">Budget</span>
      <input
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
      <b className="mono">{value == null ? "libre" : `${value} €`}</b>
      <button className="link small" onClick={() => onChange(value == null ? local : null)}>
        {value == null ? "Fixer" : "Sans limite"}
      </button>
    </div>
  );
}
