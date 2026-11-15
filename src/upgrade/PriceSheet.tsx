// Fiche prix d'un composant : prix du marché, évolution, meilleures offres (liens d'achat) et alerte de prix.
// Ouverte depuis n'importe quel prix de l'app via le contexte PriceContext.

import { createContext, useContext, useEffect, useState } from "react";
import { historyOf, priceInfo, pricesFile, trendOf, type HistoryPoint } from "./prices";
import { bestPriceOf, saveAlerts, suggestedTarget, type PriceAlert } from "./alerts";
import { openUrl, shoppingSearchUrl } from "../platform";
import { openReport, type ReportKind } from "../report";
import { isTrustedMerchant, offerLink } from "./merchants";
import { catalogText } from "./catalog";
import { Icon } from "../icons";
import { currentLang, tr } from "../settings";

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

const locale = () => (currentLang() === "en" ? "en-GB" : "fr-FR");
const eur = (n: number) => {
  const v = n.toLocaleString(locale(), { maximumFractionDigits: n % 1 ? 2 : 0, minimumFractionDigits: n % 1 ? 2 : 0 });
  return currentLang() === "en" ? `€${v}` : `${v} €`;
};
const day = (iso: string) => new Date(iso).toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" });

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
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={tr(`Prix de ${part.name}`, `Price of ${part.name}`)}>
        <div className="sheet-head">
          <div>
            <div className="cat">{tr("Prix du marché", "Market price")}</div>
            <h2 className="sheet-title">{catalogText(part.name)}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label={tr("Fermer", "Close")}>
            <Icon name="cross" />
          </button>
        </div>

        {info ? (
          <>
            <div className="sheet-kpis">
              <div>
                <div className="muted small">{tr("Meilleur prix", "Best price")}</div>
                <div className="sheet-big">{eur(best ?? info.min)}</div>
              </div>
              <div>
                <div className="muted small">{tr("Prix médian", "Median price")}</div>
                <div className="sheet-mid">{eur(info.price)}</div>
              </div>
              <div>
                <div className="muted small">{tr("Depuis le relevé précédent", "Since the previous check")}</div>
                <div className={`sheet-mid ${trend.change == null ? "" : trend.change < 0 ? "down" : trend.change > 0 ? "up" : ""}`}>
                  {trend.change == null ? "—" : `${trend.change > 0 ? "↗ +" : trend.change < 0 ? "↘ " : "→ "}${trend.change}${tr(" %", "%")}`}
                </div>
              </div>
            </div>
            <p className="muted small">
              {tr(`${info.offers} marchands, relevé du ${day(info.updatedAt)}`, `${info.offers} merchants, checked on ${day(info.updatedAt)}`)}
              {info.stale ? tr(" (le dernier relevé n'a pas trouvé assez d'offres)", " (the last check didn't find enough offers)") : ""}
              {trend.lowest != null && trend.points >= 2
                ? tr(`, plus bas relevé : ${eur(trend.lowest)} (${day(trend.lowestDate!)})`, `, lowest recorded: ${eur(trend.lowest)} (${day(trend.lowestDate!)})`)
                : ""}
            </p>

            <Sparkline points={hist} />

            <h3 className="sheet-h3">{tr("Meilleures offres", "Best offers")}</h3>
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
                          {trusted && <span className="tag">{tr("grande enseigne", "major retailer")}</span>}
                        </span>
                        {o.title && <span className="muted small offer-title">{o.title}</span>}
                      </div>
                      <span className="num offer-price">{eur(o.price)}</span>
                      {link ? (
                        <button className={`btn small-btn ${link.direct ? "" : "ghost"}`} onClick={() => openUrl(link.url)} title={link.url}>
                          {link.label} ↗
                        </button>
                      ) : (
                        <span className="muted small">{tr("lien indisponible", "link unavailable")}</span>
                      )}
                    </div>
                  );
                })}
            </div>
            <p className="muted small">
              {tr(
                "Prix TTC affichés par les marchands, frais de livraison non compris. Ils peuvent avoir changé depuis le relevé : vérifie le prix et le modèle exact sur la page du marchand.",
                "Prices including VAT as shown by the merchants, delivery not included. They may have changed since the check: confirm the price and exact model on the merchant's page.",
              )}
            </p>
            <PriceDisclosure />
          </>
        ) : (
          <p className="muted">
            {tr(
              `Ce composant n'a pas encore de prix relevé : le prix affiché (${part.price ? eur(part.price) : "—"}) est indicatif.`,
              `No price has been recorded for this part yet: the price shown (${part.price ? eur(part.price) : "—"}) is a guide only.`,
            )}
          </p>
        )}

        <button className="btn compare" onClick={() => openUrl(shoppingSearchUrl(query))}>
          {tr("Comparer tous les prix sur Google Shopping ↗", "Compare all prices on Google Shopping ↗")}
        </button>
        <p className="muted small report-line">
          {tr("Un prix, une offre ou un modèle te semble faux ?", "Does a price, offer or model look wrong?")}{" "}
          <ReportButton
            topic={tr(`prix de ${part.name}`, `price of ${part.name}`)}
            kind="prix"
            details={[
              `Composant : ${part.name} (${part.id})`,
              info ? `Meilleur prix affiché : ${eur(best ?? info.min)} ; médiane : ${eur(info.price)} ; relevé du ${day(info.updatedAt)}` : "Pas de prix relevé",
              ...(info?.best ?? []).map((o) => `Offre : ${o.merchant}, ${eur(o.price)}${o.title ? `, « ${o.title} »` : ""}`),
            ]}
          />
        </p>

        <h3 className="sheet-h3">{tr("Alerte de prix", "Price alert")}</h3>
        {alert ? (
          <div className="alert-set">
            <Icon name="check" />
            <span>
              {tr("Alerte active : tu seras prévenu quand le meilleur prix passera sous", "Alert on: you'll be notified when the best price drops below")} <b>{eur(alert.target)}</b>.
            </span>
            <button className="link small" onClick={removeAlert}>
              {tr("Supprimer", "Remove")}
            </button>
          </div>
        ) : (
          <div className="alert-form">
            <span>{tr("Préviens-moi sous", "Notify me below")}</span>
            <input type="number" min={1} step={5} value={target} onChange={(e) => setTarget(Number(e.target.value))} />
            <span>€</span>
            <button className="btn primary" onClick={setAlert} disabled={!target}>
              {tr("Créer l'alerte", "Create alert")}
            </button>
          </div>
        )}
        <p className="muted small">
          {tr(
            `Les prix sont relevés chaque lundi${pricesFile() ? ` (dernier relevé : ${day(pricesFile()!.updatedAt)})` : ""}. PCEvolu vérifie tes alertes à chaque ouverture et t'envoie une notification Windows quand un seuil est atteint.`,
            `Prices are checked every Monday${pricesFile() ? ` (last check: ${day(pricesFile()!.updatedAt)})` : ""}. PCEvolu checks your alerts each time it opens and sends you a Windows notification when a target is reached.`,
          )}
        </p>
      </div>
    </div>
  );
}

/** Mentions sous une page qui cite des prix de marchands : date du relevé, ce que comprend le prix, absence de lien commercial. */
export function PriceNotice({ extra }: { extra?: string }) {
  const f = pricesFile();
  return (
    <footer className="price-notice">
      <p>
        {f ? tr(`Prix relevés le ${day(f.updatedAt)} sur Google Shopping France`, `Prices checked on ${day(f.updatedAt)} on Google Shopping France`) : tr("Prix indicatifs", "Guide prices")}
        {tr(
          " : prix TTC affichés par les marchands, frais de livraison non compris, susceptibles d'avoir changé depuis. Le prix d'une pièce est la médiane des offres retenues. PCEvolu n'a aucun lien commercial avec les marchands cités.",
          ": prices including VAT as shown by the merchants, delivery not included, and they may have changed since. A part's price is the median of the offers kept. PCEvolu has no commercial relationship with the merchants listed.",
        )}
        {extra ? ` ${extra}` : ""}
      </p>
      <AdviceNotice />
      <PriceDisclosure />
    </footer>
  );
}

/**
 * Mention de prudence sur les conseils. Formulée comme une information (et non comme une exclusion de
 * responsabilité, qui ne serait pas opposable à un consommateur) : l'utilisateur sait d'où viennent les
 * données, qu'elles peuvent comporter des erreurs, et qu'il doit vérifier avant d'acheter.
 */
export function AdviceNotice() {
  return (
    <p className="advice-notice">
      <b>{tr("Des conseils, pas une garantie.", "Advice, not a guarantee.")}</b>{" "}
      {tr(
        "Les compatibilités, performances et prix sont calculés à partir de ce que Windows lit sur ton PC, de tes réponses et des fiches des fabricants. Malgré nos vérifications, une erreur reste possible : donnée incomplète ou mal lue, fiche modifiée depuis, modèle différent de celui décrit. Avant d'acheter, vérifie la fiche du modèle exact et la compatibilité auprès du fabricant ou du vendeur : le choix final t'appartient. Tu as repéré une erreur ?",
        "Compatibility, performance and prices are worked out from what Windows reads on your PC, your answers and the manufacturers' spec sheets. Despite our checks, mistakes are still possible: incomplete or misread data, a spec sheet changed since, or a model different from the one described. Before buying, check the spec sheet of the exact model and confirm compatibility with the manufacturer or seller: the final choice is yours. Spotted a mistake?",
      )}{" "}
      <ReportButton topic={tr("conseil ou compatibilité", "advice or compatibility")} kind="compatibilite" />
    </p>
  );
}

/** Lien « Signaler une erreur » : ouvre un email pré-rempli avec le contexte. */
export function ReportButton({ topic, details, kind, label = tr("Signaler une erreur", "Report a mistake") }: { topic: string; details?: string[]; kind?: ReportKind; label?: string }) {
  return (
    <button className="link report-link" onClick={() => openReport({ topic, details, kind })}>
      <Icon name="alert" /> {label}
    </button>
  );
}

/** Informations obligatoires d'un comparateur de prix (art. L111-7 du Code de la consommation). */
export function PriceDisclosure() {
  return (
    <details className="sheet-legal">
      <summary>{tr("Comment ces prix sont choisis", "How these prices are chosen")}</summary>
      <ul>
        <li>
          <b>{tr("Source.", "Source.")}</b>{" "}
          {tr(
            "Offres de produits neufs trouvées sur Google Shopping France lors du relevé du lundi. La liste n'est pas exhaustive : d'autres marchands peuvent proposer ce produit, parfois moins cher.",
            "Offers for new products found on Google Shopping France during the Monday check. The list isn't exhaustive: other merchants may sell this product, sometimes for less.",
          )}
        </li>
        <li>
          <b>{tr("Classement.", "Ranking.")}</b>{" "}
          {tr(
            "Du moins cher au plus cher, selon le seul prix. On affiche les trois offres les moins chères, plus jusqu'à deux offres de grandes enseignes si leur prix reste proche de la médiane.",
            "From cheapest to most expensive, by price alone. We show the three cheapest offers, plus up to two offers from major retailers if their price stays close to the median.",
          )}
        </li>
        <li>
          <b>{tr("Grandes enseignes.", "Major retailers.")}</b>{" "}
          {tr(
            "Marchands connus qui vendent en France (Amazon hors vendeurs tiers, Fnac, Darty, LDLC, Materiel.net, Cdiscount…), choisis par PCEvolu pour leur notoriété et leur service après-vente. Ce n'est ni un partenariat ni un label.",
            "Well-known merchants selling in France (Amazon excluding third-party sellers, Fnac, Darty, LDLC, Materiel.net, Cdiscount…), chosen by PCEvolu for their reputation and after-sales service. This is neither a partnership nor a quality label.",
          )}
        </li>
        <li>
          <b>{tr("Offres écartées.", "Excluded offers.")}</b>{" "}
          {tr(
            "Occasion et reconditionné, vendeurs étrangers ou d'import, annonces qui ne correspondent pas exactement au produit, et prix anormalement éloignés de la médiane.",
            "Used and refurbished items, foreign or import sellers, listings that don't exactly match the product, and prices abnormally far from the median.",
          )}
        </li>
        <li>
          <b>{tr("Prix médian.", "Median price.")}</b>{" "}
          {tr(
            "La moitié des offres retenues est moins chère, l'autre moitié plus chère. C'est ce prix qui sert au coût des plans.",
            "Half of the offers kept are cheaper, the other half more expensive. This is the price used to cost the plans.",
          )}
        </li>
        <li>
          <b>{tr("Aucun lien commercial.", "No commercial relationship.")}</b>{" "}
          {tr(
            "PCEvolu n'est rémunéré par aucun des marchands cités : aucun lien n'est sponsorisé ou affilié, et le classement ne peut pas être acheté.",
            "PCEvolu isn't paid by any of the merchants listed: no link is sponsored or affiliated, and the ranking can't be bought.",
          )}
        </li>
      </ul>
    </details>
  );
}

/** Petite courbe : médiane (trait plein) et meilleur prix (pointillés). */
function Sparkline({ points }: { points: HistoryPoint[] }) {
  if (points.length < 2) {
    return (
      <div className="spark-empty muted small">
        {tr(
          `L'historique se construit : un point par relevé hebdomadaire${points[0] ? ` (premier relevé le ${day(points[0][0])})` : ""}. La courbe apparaîtra dès le prochain lundi.`,
          `The history is building up: one point per weekly check${points[0] ? ` (first check on ${day(points[0][0])})` : ""}. The chart will appear next Monday.`,
        )}
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
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tr("Évolution du prix", "Price history")}>
      <path d={line(1)} className="spark-median" />
      <path d={line(2)} className="spark-best" />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p[1])} r={2.5} className="spark-dot">
          <title>{tr(`${day(p[0])} : médiane ${eur(p[1])}, meilleur prix ${eur(p[2])}`, `${day(p[0])}: median ${eur(p[1])}, best price ${eur(p[2])}`)}</title>
        </circle>
      ))}
      <text x={10} y={H - 3} className="spark-label">{day(points[0][0])}</text>
      <text x={W - 10} y={H - 3} textAnchor="end" className="spark-label">{day(points[points.length - 1][0])}</text>
    </svg>
  );
}
