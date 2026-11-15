import { useState } from "react";
import { bestPriceOf, isTriggered, saveAlerts, type PriceAlert } from "./alerts";
import { historyOf, pricesFile, priceInfo, trendOf } from "./prices";
import { PriceNotice, usePrices } from "./PriceSheet";
import { BrandLogo, hasBrandLogo, Icon, type IconName } from "../icons";
import { currentLang, tr } from "../settings";

const locale = () => (currentLang() === "en" ? "en-GB" : "fr-FR");
const eur = (n: number) => {
  const v = n.toLocaleString(locale(), { maximumFractionDigits: n % 1 ? 2 : 0, minimumFractionDigits: n % 1 ? 2 : 0 });
  return currentLang() === "en" ? `€${v}` : `${v} €`;
};
const shortDate = (d: string | Date) => new Date(d).toLocaleDateString(locale(), { day: "numeric", month: "short" });

/** Type de pièce deviné à partir de son identifiant de catalogue, pour l'icône. */
function partIcon(id: string): IconName {
  if (/^(rtx|rx|arc)-/.test(id)) return "gpu";
  if (/^(i[3579]|u[579]|r[579])-/.test(id)) return "chip";
  if (/^d[45]-/.test(id)) return "ram";
  if (/^(nvme|sata)-/.test(id)) return "disk";
  if (/^mb-/.test(id)) return "board";
  if (/^psu-/.test(id)) return "power";
  if (/^(arctic|pa120|lf3|p12)/.test(id)) return "fan";
  if (/^(lancool|pop)/.test(id)) return "tower";
  return "bell";
}

/** Date du prochain relevé : un lundi, 3 semaines après le dernier (ou le prochain lundi si la date est passée). */
function nextCheck(updatedAt?: string): Date {
  const monday = (d: Date) => {
    d.setDate(d.getDate() + ((8 - d.getDay()) % 7));
    return d;
  };
  const now = new Date();
  if (updatedAt) {
    const due = new Date(updatedAt);
    due.setDate(due.getDate() + 20);
    const d = monday(due);
    if (d > now) return d;
  }
  now.setDate(now.getDate() + ((8 - now.getDay()) % 7 || 7));
  return now;
}

export function AlertsView({ onPlan }: { onPlan?: () => void }) {
  const { alerts, setAlerts, open } = usePrices();
  const sorted = [...alerts].sort((a, b) => Number(isTriggered(b)) - Number(isTriggered(a)) || a.name.localeCompare(b.name));
  const save = (next: PriceAlert[]) => {
    saveAlerts(next);
    setAlerts(next);
  };
  const remove = (id: string) => save(alerts.filter((a) => a.id !== id));
  const setTarget = (id: string, target: number) => save(alerts.map((a) => (a.id === id ? { ...a, target, notifiedAt: undefined } : a)));

  const updated = pricesFile()?.updatedAt;
  const hits = alerts.filter(isTriggered).length;
  // Ce qu'on économiserait en achetant chaque pièce à son seuil plutôt qu'au meilleur prix d'aujourd'hui.
  const saving = alerts.reduce((s, a) => {
    const now = bestPriceOf(a.id);
    return now != null && now > a.target ? s + (now - a.target) : s;
  }, 0);

  return (
    <div className="al-page">
      <header className="gp-head">
        <div>
          <h1>{tr("Alertes prix", "Price alerts")}</h1>
          <p className="gp-goal">{tr("PCEvolu surveille le prix des pièces qui t'intéressent et te prévient quand elles passent sous ton seuil.", "PCEvolu keeps an eye on the prices of the parts you're interested in and lets you know when they drop below your target.")}</p>
        </div>
      </header>

      {alerts.length > 0 && (
        <div className="al-summary">
          <div>
            <b className="num">{alerts.length}</b>
            <span>{tr(`pièce${alerts.length > 1 ? "s" : ""} surveillée${alerts.length > 1 ? "s" : ""}`, `part${alerts.length > 1 ? "s" : ""} watched`)}</span>
          </div>
          <div className={hits ? "ok" : ""}>
            <b className="num">{hits}</b>
            <span>{tr(`seuil${hits > 1 ? "s" : ""} atteint${hits > 1 ? "s" : ""}`, `target${hits === 1 ? "" : "s"} reached`)}</span>
          </div>
          <div>
            <b className="num">{eur(Math.round(saving))}</b>
            <span>{tr("d'économie si tous les seuils sont atteints", "saved if every target is reached")}</span>
          </div>
          <div>
            <b>{shortDate(nextCheck(updated))}</b>
            <span>{tr(`prochain relevé${updated ? ` (dernier le ${shortDate(updated)})` : ""}`, `next check${updated ? ` (last on ${shortDate(updated)})` : ""}`)}</span>
          </div>
        </div>
      )}

      {alerts.length === 0 ? (
        <div className="al-empty">
          <span className="al-empty-ico">
            <Icon name="bell" />
          </span>
          <div>
            <p className="al-empty-title">{tr("Aucune pièce surveillée pour l'instant", "You're not watching any parts yet")}</p>
            <p className="muted">
              {tr(
                "Clique sur un prix, dans Mon plan ou Toutes les pièces, pour voir son évolution et créer une alerte. Tu peux aussi surveiller tout un plan d'un coup avec « Me prévenir si ces prix baissent ».",
                "Click a price, in My plan or All parts, to see how it has changed and create an alert. You can also watch a whole plan at once with “Let me know if these prices drop”.",
              )}
            </p>
            {onPlan && (
              <button className="btn al-empty-btn" onClick={onPlan}>
                {tr("Aller à mon plan", "Go to my plan")}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="al-cards">
          {sorted.map((a) => (
            <AlertCard
              key={a.id}
              a={a}
              onOpen={() => open({ id: a.id, name: a.name, price: bestPriceOf(a.id) })}
              onRemove={() => remove(a.id)}
              onTarget={(t) => setTarget(a.id, t)}
            />
          ))}
        </div>
      )}

      {alerts.length > 0 && <PriceNotice />}
    </div>
  );
}

function AlertCard({ a, onOpen, onRemove, onTarget }: { a: PriceAlert; onOpen: () => void; onRemove: () => void; onTarget: (t: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(a.target);
  const now = bestPriceOf(a.id);
  const info = priceInfo(a.id);
  const hit = isTriggered(a);
  const t = trendOf(a.id);
  const gap = now != null ? now - a.target : undefined;
  // Progression vers le seuil : 0 % au prix de départ, 100 % au seuil.
  const start = Math.max(a.startPrice ?? now ?? a.target, now ?? 0);
  const progress = hit ? 100 : now != null && start > a.target ? Math.max(0, Math.min(100, ((start - now) / (start - a.target)) * 100)) : 0;
  const statusKey = hit ? "hit" : t.change != null && t.change < 0 ? "down" : t.change != null && t.change > 0 ? "up" : "wait";
  const status = { hit: tr("Seuil atteint", "Target reached"), down: tr("En baisse", "Going down"), up: tr("En hausse", "Going up"), wait: tr("En attente", "Waiting") }[statusKey];

  return (
    <article className={`al-card ${hit ? "hit" : ""}`}>
      <header className="al-card-head">
        <span className="al-ico">{hasBrandLogo(a.name) ? <BrandLogo brand={a.name} /> : <Icon name={partIcon(a.id)} />}</span>
        <div className="al-card-title">
          <button className="al-name" onClick={onOpen}>
            {a.name}
          </button>
          <span className={`al-status s-${statusKey}`}>{status}</span>
        </div>
        <button className="icon-btn" onClick={onRemove} aria-label={tr(`Ne plus surveiller ${a.name}`, `Stop watching ${a.name}`)} title={tr("Ne plus surveiller", "Stop watching")}>
          <Icon name="cross" />
        </button>
      </header>

      <div className="al-card-body">
        <div className="al-facts">
          <div className="al-now">
            <span className="muted">{tr("Meilleur prix aujourd'hui", "Best price today")}</span>
            <b className="num">{now != null ? eur(now) : "—"}</b>
            {info && <span className="muted small">{tr("prix médian", "median price")} {eur(info.price)}</span>}
          </div>

          <div className="al-goal">
            <div className="al-goal-line">
              {editing ? (
                <form
                  className="al-edit"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (draft > 0) onTarget(draft);
                    setEditing(false);
                  }}
                >
                  <label htmlFor={`seuil-${a.id}`}>{tr("Seuil", "Target")}</label>
                  <input id={`seuil-${a.id}`} type="number" min={1} step={5} value={draft} onChange={(e) => setDraft(Number(e.target.value))} autoFocus />
                  <span>€</span>
                  <button className="btn primary small-btn" type="submit">
                    {tr("Enregistrer", "Save")}
                  </button>
                </form>
              ) : (
                <>
                  <span>
                    {tr("Ton seuil :", "Your target:")} <b className="num">{eur(a.target)}</b>
                  </span>
                  <button
                    className="link small"
                    onClick={() => {
                      setDraft(a.target);
                      setEditing(true);
                    }}
                  >
                    {tr("Modifier", "Edit")}
                  </button>
                </>
              )}
            </div>
            <div className="al-progress" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} aria-label={tr("Progression vers le seuil", "Progress towards your target")}>
              <i style={{ width: `${progress}%` }} />
            </div>
            <p className="al-gap">
              {hit
                ? tr(`Le meilleur prix est passé sous ton seuil : c'est le moment d'acheter.`, "The best price has dropped below your target: now's the time to buy.")
                : gap != null
                  ? tr(
                      `Il manque ${eur(Math.round(gap * 100) / 100)} (−${Math.round((gap / now!) * 100)} %) pour l'atteindre.`,
                      `It needs to drop another ${eur(Math.round(gap * 100) / 100)} (−${Math.round((gap / now!) * 100)}%) to get there.`,
                    )
                  : tr("Pas encore de prix relevé pour cette pièce.", "No price recorded for this part yet.")}
            </p>
          </div>

          <ul className="al-stats">
            {a.startPrice != null && (
              <li>
                <span>{tr(`À la création (${shortDate(a.createdAt)})`, `When created (${shortDate(a.createdAt)})`)}</span>
                <b className="num">{eur(a.startPrice)}</b>
              </li>
            )}
            {t.lowest != null && (
              <li>
                <span>{tr("Plus bas relevé", "Lowest recorded")}</span>
                <b className="num">{eur(t.lowest)}</b>
              </li>
            )}
            {t.change != null && (
              <li>
                <span>{tr("Depuis le relevé précédent", "Since the previous check")}</span>
                <b className={`num ${t.change < 0 ? "ok-text" : t.change > 0 ? "bad-text" : ""}`}>
                  {t.change > 0 ? "+" : ""}
                  {t.change}
                  {tr(" %", "%")}
                </b>
              </li>
            )}
          </ul>
        </div>

        <PriceChart id={a.id} target={a.target} start={a.startPrice != null ? { date: a.createdAt, price: a.startPrice } : undefined} now={now} />
      </div>

      <footer className="al-card-foot">
        <button className="link" onClick={onOpen}>
          {tr("Voir les offres et l'historique", "See offers and price history")}
        </button>
      </footer>
    </article>
  );
}

/** Courbe du meilleur prix et de la médiane, avec le seuil de l'alerte en pointillés. */
function PriceChart({ id, target, start, now }: { id: string; target: number; start?: { date: string; price: number }; now?: number }) {
  const hist = historyOf(id);
  const best: { d: number; v: number }[] = hist.map(([d, , b]) => ({ d: Date.parse(d), v: b }));
  const median: { d: number; v: number }[] = hist.map(([d, m]) => ({ d: Date.parse(d), v: m }));
  if (start && (!best.length || Date.parse(start.date) < best[0].d - 86400000)) best.unshift({ d: Date.parse(start.date), v: start.price });
  if (now != null && best.length && Math.abs(best[best.length - 1].v - now) > 0.01 && Date.now() - best[best.length - 1].d > 86400000) best.push({ d: Date.now(), v: now });
  if (!best.length && now != null) best.push({ d: Date.now(), v: now });

  const W = 520;
  const H = 190;
  const pad = { l: 56, r: 16, t: 16, b: 28 };
  const values = [...best.map((p) => p.v), ...median.map((p) => p.v), target];
  const lo = Math.min(...values) * 0.9;
  const hi = Math.max(...values) * 1.06;
  const dates = [...best, ...median].map((p) => p.d);
  const d0 = Math.min(...dates);
  const d1 = Math.max(...dates, d0 + 6 * 86400000); // au moins une semaine de large
  const x = (d: number) => pad.l + ((d - d0) / (d1 - d0 || 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo || 1)) * (H - pad.t - pad.b);
  const line = (pts: { d: number; v: number }[]) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.d).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const ticks = [lo + (hi - lo) * 0.15, (lo + hi) / 2, hi - (hi - lo) * 0.1].map((v) => Math.round(v / 5) * 5);
  const lastBest = best[best.length - 1];
  const area = best.length >= 2 ? `${line(best)} L${x(lastBest.d).toFixed(1)},${H - pad.b} L${x(best[0].d).toFixed(1)},${H - pad.b} Z` : "";

  return (
    <figure className="al-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tr(`Évolution du prix, seuil à ${eur(target)}`, `Price history, target at ${eur(target)}`)}>
        {ticks.map((v) => (
          <g key={v} className="al-grid">
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} />
            <text x={pad.l - 8} y={y(v) + 4} textAnchor="end">
              {currentLang() === "en" ? `€${v}` : `${v} €`}
            </text>
          </g>
        ))}
        <line className="al-target" x1={pad.l} x2={W - pad.r} y1={y(target)} y2={y(target)} />
        <text className="al-target-label" x={W - pad.r} y={y(target) - 6} textAnchor="end">
          {tr("Ton seuil", "Your target")} {eur(target)}
        </text>
        {median.length >= 2 && <path className="al-median" d={line(median)} />}
        {area && <path className="al-area" d={area} />}
        {best.length >= 2 && <path className="al-best" d={line(best)} />}
        {best.map((p, i) => (
          <circle key={i} className={`al-dot ${i === best.length - 1 ? "last" : ""}`} cx={x(p.d)} cy={y(p.v)} r={i === best.length - 1 ? 5 : 3} />
        ))}
        {lastBest && (
          <text className="al-last-label" x={Math.min(x(lastBest.d), W - pad.r - 4)} y={y(lastBest.v) - 10} textAnchor={x(lastBest.d) > W - 90 ? "end" : "middle"}>
            {eur(lastBest.v)}
          </text>
        )}
        <text className="al-axis" x={pad.l} y={H - 8}>
          {shortDate(new Date(d0))}
        </text>
        <text className="al-axis" x={W - pad.r} y={H - 8} textAnchor="end">
          {shortDate(new Date(d1))}
        </text>
      </svg>
      <figcaption>
        <span className="al-key best">{tr("Meilleur prix", "Best price")}</span>
        {median.length >= 2 && <span className="al-key median">{tr("Prix médian", "Median price")}</span>}
        <span className="al-key target">{tr("Ton seuil", "Your target")}</span>
        {best.length < 2 && <span className="muted">{tr("La courbe se dessine au fil des relevés, toutes les 3 semaines.", "The chart fills in with each check, every 3 weeks.")}</span>}
      </figcaption>
    </figure>
  );
}
