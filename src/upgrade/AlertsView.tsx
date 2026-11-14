import { bestPriceOf, isTriggered, saveAlerts } from "./alerts";
import { trendOf, pricesFile } from "./prices";
import { usePrices } from "./PriceSheet";
import { Icon } from "../icons";

const eur = (n: number) => `${n.toLocaleString("fr-FR", { maximumFractionDigits: n % 1 ? 2 : 0, minimumFractionDigits: n % 1 ? 2 : 0 })} €`;

export function AlertsView() {
  const { alerts, setAlerts, open } = usePrices();
  const sorted = [...alerts].sort((a, b) => Number(isTriggered(b)) - Number(isTriggered(a)) || a.name.localeCompare(b.name));
  const remove = (id: string) => {
    const next = alerts.filter((a) => a.id !== id);
    saveAlerts(next);
    setAlerts(next);
  };
  const updated = pricesFile()?.updatedAt;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Alertes prix</h1>
          <div className="muted">
            Les prix sont relevés chaque lundi{updated ? ` (dernier relevé le ${new Date(updated).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })})` : ""}.
            PCEvolu vérifie tes alertes à chaque ouverture.
          </div>
        </div>
      </header>

      {alerts.length === 0 ? (
        <div className="panel empty-alerts">
          <Icon name="bell" />
          <div>
            <b>Aucune alerte pour l'instant.</b>
            <p className="muted">
              Clique sur un prix (dans Upgrades, Mon objectif ou Améliorations) pour voir son évolution et créer une alerte. Tu peux aussi surveiller tout un
              plan d'un coup avec le bouton « Surveiller les prix de ce plan ».
            </p>
          </div>
        </div>
      ) : (
        <div className="stack">
          {sorted.map((a) => {
            const now = bestPriceOf(a.id);
            const hit = isTriggered(a);
            const t = trendOf(a.id);
            const diff = a.startPrice && now ? Math.round(((now - a.startPrice) / a.startPrice) * 100) : undefined;
            return (
              <div key={a.id} className={`alert-row ${hit ? "hit" : ""}`}>
                <Icon name={hit ? "check" : "bell"} />
                <div className="alert-main">
                  <button className="link alert-name" onClick={() => open({ id: a.id, name: a.name, price: now })}>
                    {a.name}
                  </button>
                  <div className="muted small">
                    Seuil : {eur(a.target)}
                    {a.startPrice ? ` · ${eur(a.startPrice)} à la création` : ""}
                    {diff != null && diff !== 0 ? ` (${diff > 0 ? "+" : ""}${diff} % depuis)` : ""}
                    {t.change != null ? ` · ${t.change < 0 ? "↘" : t.change > 0 ? "↗" : "→"} ${t.change} % cette semaine` : ""}
                  </div>
                </div>
                <div className="alert-price">
                  <div className="mono">{now != null ? eur(now) : "—"}</div>
                  <div className={`small ${hit ? "ok-text" : "muted"}`}>{hit ? "Seuil atteint !" : now != null ? `encore ${eur(Math.max(0, now - a.target))}` : "pas de prix"}</div>
                </div>
                <button className="icon-btn" onClick={() => remove(a.id)} aria-label="Supprimer l'alerte" title="Supprimer l'alerte">
                  <Icon name="cross" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
