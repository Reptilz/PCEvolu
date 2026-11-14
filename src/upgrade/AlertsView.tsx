import { bestPriceOf, isTriggered, saveAlerts } from "./alerts";
import { trendOf, pricesFile } from "./prices";
import { usePrices } from "./PriceSheet";
import { Icon } from "../icons";

const eur = (n: number) => `${n.toLocaleString("fr-FR", { maximumFractionDigits: n % 1 ? 2 : 0, minimumFractionDigits: n % 1 ? 2 : 0 })} €`;

export function AlertsView({ onPlan }: { onPlan?: () => void }) {
  const { alerts, setAlerts, open } = usePrices();
  const sorted = [...alerts].sort((a, b) => Number(isTriggered(b)) - Number(isTriggered(a)) || a.name.localeCompare(b.name));
  const remove = (id: string) => {
    const next = alerts.filter((a) => a.id !== id);
    saveAlerts(next);
    setAlerts(next);
  };
  const updated = pricesFile()?.updatedAt;

  return (
    <div className="al-page">
      <header className="gp-head">
        <div>
          <h1>Alertes prix</h1>
          <p className="gp-goal">
            Les prix sont relevés chaque lundi{updated ? `, le dernier le ${new Date(updated).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}` : ""}. PCEvolu
            vérifie tes alertes à chaque ouverture.
          </p>
        </div>
      </header>

      {alerts.length === 0 ? (
        <div className="al-empty">
          <p className="al-empty-title">Aucune alerte pour l'instant.</p>
          <p className="muted">
            Clique sur un prix, dans Upgrades ou Mon objectif, pour voir son évolution et créer une alerte. Tu peux aussi surveiller tout un plan d'un coup
            avec « Me prévenir si ces prix baissent ».
          </p>
          {onPlan && (
            <button className="btn al-empty-btn" onClick={onPlan}>
              Aller à mon plan
            </button>
          )}
        </div>
      ) : (
        <ul className="al-list">
          {sorted.map((a) => {
            const now = bestPriceOf(a.id);
            const hit = isTriggered(a);
            const t = trendOf(a.id);
            const diff = a.startPrice && now ? Math.round(((now - a.startPrice) / a.startPrice) * 100) : undefined;
            const meta = [
              `Seuil ${eur(a.target)}`,
              a.startPrice ? `${eur(a.startPrice)} à la création${diff ? ` (${diff > 0 ? "+" : ""}${diff} % depuis)` : ""}` : "",
              t.change ? `${t.change > 0 ? "+" : ""}${t.change} % cette semaine` : "",
            ].filter(Boolean);
            return (
              <li key={a.id} className={`al-row ${hit ? "hit" : ""}`}>
                <div className="al-main">
                  <button className="al-name" onClick={() => open({ id: a.id, name: a.name, price: now })}>
                    {a.name}
                  </button>
                  <div className="al-meta">{meta.join(", ")}.</div>
                </div>
                <div className="al-price">
                  <div className="num">{now != null ? eur(now) : "—"}</div>
                  <div className={hit ? "ok-text" : "muted"}>{hit ? "Seuil atteint" : now != null ? `encore ${eur(Math.max(0, now - a.target))}` : "pas de prix"}</div>
                </div>
                <button className="icon-btn" onClick={() => remove(a.id)} aria-label="Supprimer l'alerte" title="Supprimer l'alerte">
                  <Icon name="cross" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
