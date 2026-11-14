// Fiche prix d'un composant : prix du marché, évolution, meilleures offres (liens d'achat) et alerte de prix.
// Ouverte depuis n'importe quel prix de l'app via le contexte PriceContext.

import { createContext, useContext, useEffect, useState } from "react";
import { historyOf, priceInfo, pricesFile, trendOf, type HistoryPoint } from "./prices";
import { bestPriceOf, saveAlerts, suggestedTarget, type PriceAlert } from "./alerts";
import { openUrl, shoppingSearchUrl } from "../platform";
import { isTrustedMerchant, offerLink } from "./merchants";
import { Icon } from "../icons";

export interface SheetPart {
  id: string;
  name: string;
  price?: number;
}

interface PriceCtx {
  open: (part: SheetPart) => void;
  alerts: PriceAlert[];
  setAlerts: (a: PriceAlert[]) => void;
}

export const PriceContext = createContext<PriceCtx>({ open: () => {}, alerts: [], setAlerts: () => {} });
export const usePrices = () => useContext(PriceContext);

const eur = (n: number) => `${n.toLocaleString("fr-FR", { maximumFractionDigits: n % 1 ? 2 : 0, minimumFractionDigits: n % 1 ? 2 : 0 })} €`;
const day = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

export function PriceSheet({ part, onClose }: { part: SheetPart; onClose: () => void }) {
  const { alerts, setAlerts } = usePrices();
  const info = priceInfo(part.id);
  const trend = trendOf(part.id);
  const hist = historyOf(part.id);
  const best = bestPriceOf(part.id) ?? part.price;
  const alert = alerts.find((a) => a.id === part.id);
  const [target, setTarget] = useState<number>(() => alert?.target ?? suggestedTarget(part.id, part.price ?? 0));
  // Recherche chez le marchand : nom sans les exemples entre parenthèses ; pour les cartes graphiques,
  // sans la quantité de mémoire (« 12 Go »), qui réduit inutilement les résultats.
  const isGpu = /^(rtx|gtx|rx|arc|vega)-/.test(part.id);
  const query = part.name
    .replace(/\s*\(.*?\)\s*/g, " ")
    .replace(isGpu ? /\b\d+ ?Go\b/ : /$^/, "")
    .replace(/\s+/g, " ")
    .trim();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const update = (next: PriceAlert[]) => {
    saveAlerts(next);
    setAlerts(next);
  };
  const setAlert = () =>
    update([
      ...alerts.filter((a) => a.id !== part.id),
      { id: part.id, name: part.name, target, startPrice: best, createdAt: new Date().toISOString() },
    ]);
  const removeAlert = () => update(alerts.filter((a) => a.id !== part.id));

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Prix de ${part.name}`}>
        <div className="sheet-head">
          <div>
            <div className="cat">Prix du marché</div>
            <h2 className="sheet-title">{part.name}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer">
            <Icon name="cross" />
          </button>
        </div>

        {info ? (
          <>
            <div className="sheet-kpis">
              <div>
                <div className="muted small">Meilleur prix</div>
                <div className="sheet-big">{eur(best ?? info.min)}</div>
              </div>
              <div>
                <div className="muted small">Prix médian</div>
                <div className="sheet-mid">{eur(info.price)}</div>
              </div>
              <div>
                <div className="muted small">Évolution</div>
                <div className={`sheet-mid ${trend.change == null ? "" : trend.change < 0 ? "down" : trend.change > 0 ? "up" : ""}`}>
                  {trend.change == null ? "—" : `${trend.change > 0 ? "↗ +" : trend.change < 0 ? "↘ " : "→ "}${trend.change} %`}
                </div>
              </div>
            </div>
            <p className="muted small">
              {info.offers} marchands · relevé du {day(info.updatedAt)}
              {info.stale ? " (le dernier relevé n'a pas trouvé assez d'offres)" : ""}
              {trend.lowest != null && trend.points >= 2 ? ` · plus bas relevé : ${eur(trend.lowest)} (${day(trend.lowestDate!)})` : ""}
            </p>

            <Sparkline points={hist} />

            <h3 className="sheet-h3">Meilleures offres</h3>
            <div className="offers">
              {[...(info.best ?? [])]
                .sort((a, b) => a.price - b.price)
                .map((o, i) => {
                  const link = offerLink(o.merchant, query, o.title, o.link);
                  const trusted = isTrustedMerchant(o.merchant);
                  return (
                    <div key={i} className="offer">
                      <div className="offer-main">
                        <span className="offer-merchant">
                          {o.merchant}
                          {trusted && <span className="tag">grande enseigne</span>}
                        </span>
                        {o.title && <span className="muted small offer-title">{o.title}</span>}
                      </div>
                      <span className="mono">{eur(o.price)}</span>
                      {link ? (
                        <button className={`btn small-btn ${link.direct ? "" : "ghost"}`} onClick={() => openUrl(link.url)} title={link.url}>
                          {link.label} ↗
                        </button>
                      ) : (
                        <span className="muted small">lien indisponible</span>
                      )}
                    </div>
                  );
                })}
            </div>
            <p className="muted small">
              Les liens ouvrent le site du marchand. Les prix peuvent avoir changé depuis le relevé : vérifie le prix et le modèle exact sur la page.
            </p>
          </>
        ) : (
          <p className="muted">Ce composant n'a pas encore de prix relevé : le prix affiché ({part.price ? eur(part.price) : "—"}) est indicatif.</p>
        )}

        <button className="btn compare" onClick={() => openUrl(shoppingSearchUrl(query))}>
          Comparer tous les prix sur Google Shopping ↗
        </button>

        <h3 className="sheet-h3">Alerte de prix</h3>
        {alert ? (
          <div className="alert-set">
            <Icon name="check" />
            <span>
              Alerte active : tu seras prévenu quand le meilleur prix passera sous <b>{eur(alert.target)}</b>.
            </span>
            <button className="link small" onClick={removeAlert}>
              Supprimer
            </button>
          </div>
        ) : (
          <div className="alert-form">
            <span>Préviens-moi sous</span>
            <input type="number" min={1} step={5} value={target} onChange={(e) => setTarget(Number(e.target.value))} />
            <span>€</span>
            <button className="btn primary" onClick={setAlert} disabled={!target}>
              Créer l'alerte
            </button>
          </div>
        )}
        <p className="muted small">
          Les prix sont relevés chaque lundi
          {pricesFile() ? ` (dernier relevé : ${day(pricesFile()!.updatedAt)})` : ""}. PCEvolu vérifie tes alertes à chaque ouverture et t'envoie une
          notification Windows quand un seuil est atteint.
        </p>
      </div>
    </div>
  );
}

/** Petite courbe : médiane (trait plein) et meilleur prix (pointillés). */
function Sparkline({ points }: { points: HistoryPoint[] }) {
  if (points.length < 2) {
    return (
      <div className="spark-empty muted small">
        L'historique se construit : un point par relevé hebdomadaire{points[0] ? ` (premier relevé le ${day(points[0][0])})` : ""}. La courbe apparaîtra dès le
        prochain lundi.
      </div>
    );
  }
  const W = 460;
  const H = 110;
  const vals = points.flatMap((p) => [p[1], p[2]]);
  const lo = Math.min(...vals) * 0.97;
  const hi = Math.max(...vals) * 1.03;
  const x = (i: number) => (i / (points.length - 1)) * (W - 20) + 10;
  const y = (v: number) => H - 18 - ((v - lo) / (hi - lo || 1)) * (H - 30);
  const line = (k: 1 | 2) => points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(" ");
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Évolution du prix">
      <path d={line(1)} className="spark-median" />
      <path d={line(2)} className="spark-best" />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p[1])} r={2.5} className="spark-dot">
          <title>{`${day(p[0])} : médiane ${eur(p[1])}, meilleur prix ${eur(p[2])}`}</title>
        </circle>
      ))}
      <text x={10} y={H - 3} className="spark-label">{day(points[0][0])}</text>
      <text x={W - 10} y={H - 3} textAnchor="end" className="spark-label">{day(points[points.length - 1][0])}</text>
    </svg>
  );
}
