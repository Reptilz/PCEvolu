import { T } from "../glossary";
import { useState, type ReactNode } from "react";
import type { Report } from "../types";
import {
  FPS_LABEL, RES_LABEL, USAGE_LABEL, fluidity, isGaming,
  type FpsTarget, type Goal, type NeedStatus, type Resolution, type Usage, type Verdict,
} from "./goal";
import { Icon, type IconName } from "../icons";
import type { OptimizeResult } from "./optimizer";
import { Alternatives, RecommendedPlan, Tiers } from "./PlanView";
import { PriceNotice } from "./PriceSheet";

// ---------------------------------------------------------------------------
// Assistant « Mon objectif »
// ---------------------------------------------------------------------------

const USAGES: { id: Usage; icon: IconName; hint: string }[] = [
  { id: "office", icon: "folder", hint: "Internet, mails, Office, vidéos, visio" },
  { id: "gaming", icon: "gpu", hint: "Jeux récents, en solo ou en ligne" },
  { id: "creation", icon: "spark", hint: "Montage vidéo, retouche photo, 3D" },
  { id: "streaming", icon: "screen", hint: "Jouer et diffuser en direct (Twitch, YouTube)" },
];

const RESOLUTIONS: { id: Resolution; hint: string }[] = [
  { id: "1080p", hint: "Écrans 22 à 24 pouces, le plus courant" },
  { id: "1440p", hint: "Écrans 27 pouces : le bon compromis" },
  { id: "4k", hint: "Grands écrans et TV : très exigeant" },
];

const FPS_CHOICES: { id: FpsTarget; title: string; hint: string }[] = [
  { id: 60, title: "Confort", hint: "Fluide pour les jeux solo et l'aventure" },
  { id: 100, title: "Très fluide", hint: "Pour profiter d'un écran 120-144 Hz" },
  { id: 144, title: "Compétitif", hint: "FPS en ligne, esport : réactivité maximale" },
];

/** Résolution et fréquence de l'écran principal, pour préremplir l'assistant. */
function detectedScreen(r: Report): { res?: Resolution; fps?: FpsTarget; label?: string } {
  const d = r.displays.find((x) => x.primary) ?? r.displays[0];
  if (!d) return {};
  const res: Resolution = d.height >= 2000 ? "4k" : d.height >= 1400 ? "1440p" : "1080p";
  const fps: FpsTarget = d.maxHz >= 140 ? 144 : d.maxHz >= 100 ? 100 : 60;
  return { res, fps, label: `${d.width}×${d.height}, jusqu'à ${d.maxHz} Hz` };
}

export function GoalWizard({ report, goal, onDone, onSkip }: { report: Report; goal: Goal; onDone: (g: Goal) => void; onSkip?: () => void }) {
  const screen = detectedScreen(report);
  const [g, setG] = useState<Goal>(() =>
    goal.configured ? goal : { ...goal, resolution: screen.res ?? goal.resolution, fps: screen.fps === 144 ? 100 : screen.fps ?? goal.fps },
  );
  const steps = isGaming(g.usage) ? ["usage", "res", "fps", "budget"] : ["usage", "budget"];
  const [i, setI] = useState(0);
  const step = steps[Math.min(i, steps.length - 1)];
  const next = () => (i + 1 < steps.length ? setI(i + 1) : onDone({ ...g, configured: true }));
  const pick = (patch: Partial<Goal>) => {
    setG((x) => ({ ...x, ...patch }));
  };

  return (
    <div className="wizard">
      <div className="wiz-progress">
        {steps.map((s, k) => (
          <span key={s} className={k <= i ? "on" : ""} />
        ))}
      </div>

      {step === "usage" && (
        <>
          <h1>Que veux-tu faire avec ton PC ?</h1>
          <p className="muted">PCEvolu adapte son diagnostic et ses conseils à ton usage.</p>
          <div className="choices four">
            {USAGES.map((u) => (
              <button key={u.id} className={`choice ${g.usage === u.id ? "on" : ""}`} onClick={() => pick({ usage: u.id })}>
                <Icon name={u.icon} />
                <b>{USAGE_LABEL[u.id]}</b>
                <span>{u.hint}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {step === "res" && (
        <>
          <h1>En quelle résolution joues-tu ?</h1>
          <p className="muted">{screen.label ? `Ton écran : ${screen.label}.` : "Choisis la définition de ton écran."}</p>
          <div className="choices">
            {RESOLUTIONS.map((r) => (
              <button key={r.id} className={`choice ${g.resolution === r.id ? "on" : ""}`} onClick={() => pick({ resolution: r.id })}>
                <b>{RES_LABEL[r.id]}</b>
                <span>{r.hint}</span>
                {screen.res === r.id && <em className="tag">Ton écran</em>}
              </button>
            ))}
          </div>
        </>
      )}

      {step === "fps" && (
        <>
          <h1>Quelle fluidité vises-tu ?</h1>
          <p className="muted">En images par seconde (i/s), dans les jeux récents en qualité élevée.</p>
          <div className="choices">
            {FPS_CHOICES.map((f) => (
              <button key={f.id} className={`choice ${g.fps === f.id ? "on" : ""}`} onClick={() => pick({ fps: f.id })}>
                <b>
                  {f.title} · {FPS_LABEL[f.id]}
                </b>
                <span>{f.hint}</span>
                {screen.fps != null && f.id === 144 && screen.fps === 144 && <em className="tag">Ton écran monte à 144 Hz</em>}
              </button>
            ))}
          </div>
        </>
      )}

      {step === "budget" && (
        <>
          <h1>Quel budget maximum ?</h1>
          <p className="muted">PCEvolu te montrera d'abord ce qui rentre dans ce budget, pièces obligatoires comprises.</p>
          <div className="budget">
            <div className="budget-value">{g.budget == null ? "Pas de limite" : `${g.budget} €`}</div>
            <input
              type="range"
              min={0}
              max={3000}
              step={50}
              value={g.budget ?? 3000}
              disabled={g.budget == null}
              onChange={(e) => pick({ budget: Number(e.target.value) })}
            />
            <div className="budget-presets">
              {[200, 500, 800, 1200, 2000].map((b) => (
                <button key={b} className={`chip-btn ${g.budget === b ? "on" : ""}`} onClick={() => pick({ budget: b })}>
                  {b} €
                </button>
              ))}
              <button className={`chip-btn ${g.budget == null ? "on" : ""}`} onClick={() => pick({ budget: g.budget == null ? 800 : null })}>
                Pas de limite
              </button>
            </div>
          </div>
        </>
      )}

      <div className="wiz-actions">
        {i > 0 ? (
          <button className="btn ghost" onClick={() => setI(i - 1)}>
            Retour
          </button>
        ) : onSkip ? (
          <button className="btn ghost" onClick={onSkip}>
            Plus tard
          </button>
        ) : (
          <span />
        )}
        <button className="btn primary" onClick={next}>
          {i + 1 < steps.length ? "Continuer" : "Voir mon diagnostic"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Diagnostic
// ---------------------------------------------------------------------------

const STATUS_ICON: Record<NeedStatus, IconName> = { ok: "check", limited: "alert", missing: "cross" };
const FIX_LABEL: Record<string, string> = { gpu: "Cartes graphiques", cpu: "Processeurs", ram: "Mémoire", storage: "Stockage" };

/** Phrase d'objectif : « Jeu en 2K à 100 i/s, budget 900 € ». */
export function goalSentence(g: Goal): string {
  const budget = g.budget == null ? "sans limite de budget" : `budget ${g.budget} €`;
  if (isGaming(g.usage)) {
    const what = g.usage === "streaming" ? "Jeu et streaming" : "Jeu";
    return `${what} en ${RES_LABEL[g.resolution].split(" (")[0]} à ${g.fps} i/s, ${budget}`;
  }
  return `${USAGE_LABEL[g.usage]}, ${budget}`;
}

type GoalTab = "alternatives" | "tiers" | "diagnostic";

export function GoalDiagnostic({ goal, verdict, plan, onBudget, onEdit, onUpgrades, byPart, next }: {
  goal: Goal; verdict: Verdict; plan?: OptimizeResult; onBudget: (b: number | null) => void; onEdit: () => void; onUpgrades: (tab?: string) => void;
  /** Les achats pièce par pièce : besoins de l'objectif et options vérifiées. */
  byPart?: ReactNode;
  /** Bouton « Étape suivante ». */
  next?: ReactNode;
}) {
  const [tab, setTab] = useState<GoalTab>("alternatives");
  const after = plan?.best && !plan.current.reached ? plan.best.evaluation.fps : undefined;
  const tabs: { id: GoalTab; label: string; count?: number }[] = [
    { id: "alternatives", label: "Autres options", count: plan?.alternatives.length },
    { id: "tiers", label: "Selon le budget", count: plan?.tiers.length },
    { id: "diagnostic", label: "Pièce par pièce" },
  ];

  return (
    <div className="goal-page">
      <header className="gp-head">
        <div>
          <h1>Mon plan</h1>
          <p className="gp-goal">{goalSentence(goal)}</p>
        </div>
        <button className="btn ghost" onClick={onEdit}>
          Modifier
        </button>
      </header>

      <section className={`answer a-${verdict.level}`}>
        <p className="answer-title">{verdict.title}</p>
        {verdict.fps ? (
          <FpsGauge today={verdict.fps.fps} after={after} goal={goal.fps} limit={verdict.fps.limit} />
        ) : (
          <p className="answer-sub">{verdict.summary}</p>
        )}
      </section>

      {plan && <RecommendedPlan goal={goal} result={plan} onBudget={onBudget} onDetails={(t) => onUpgrades(t)} />}

      <div className="seg" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
            {t.label}
            {t.count ? <span className="seg-count">{t.count}</span> : null}
          </button>
        ))}
      </div>

      <div className="seg-panel">
        {tab === "alternatives" && plan && <Alternatives result={plan} goal={goal} onDetails={(t) => onUpgrades(t)} />}
        {tab === "tiers" && plan && <Tiers result={plan} goal={goal} onBudget={onBudget} onDetails={(t) => onUpgrades(t)} />}
        {tab === "diagnostic" && <Diagnostic goal={goal} verdict={verdict} onUpgrades={onUpgrades} byPart={byPart} />}
      </div>
      <PriceNotice />
      {next}
    </div>
  );
}

/** La jauge d'images par seconde : aujourd'hui, avec le plan conseillé, et l'objectif. */
function FpsGauge({ today, after, goal, limit }: { today: number; after?: number; goal: number; limit: "gpu" | "cpu" }) {
  const max = Math.max(goal * 1.25, (after ?? 0) * 1.08, today * 1.1);
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div className="gauge">
      <div className="gauge-track">
        {after != null && after > today && <i className="gauge-after" style={{ width: pct(after) }} />}
        <i className="gauge-today" style={{ width: pct(today) }} />
        <span className="gauge-goal" style={{ left: pct(goal) }} />
      </div>
      <div className="gauge-legend">
        <span>
          Aujourd'hui : <b>{fluidity(today).toLowerCase()}</b> <span className="num">(≈ {today} i/s)</span>, limité par{" "}
          {limit === "gpu" ? "la carte graphique" : "le processeur"}
        </span>
        {after != null && after > today && (
          <span className="gauge-legend-after">
            Avec le plan : <b>{fluidity(after).toLowerCase()}</b> <span className="num">(≈ {after} i/s)</span>
          </span>
        )}
        <span className="gauge-legend-goal">
          Objectif : <b>{fluidity(goal).toLowerCase()}</b> <span className="num">({goal} i/s)</span>
        </span>
      </div>
    </div>
  );
}

function Diagnostic({ goal, verdict, onUpgrades, byPart }: { goal: Goal; verdict: Verdict; onUpgrades: (tab?: string) => void; byPart?: ReactNode }) {
  return (
    <>
      {verdict.fps && (
        <div className="diag-fps">
          <FpsBar label="Ta carte graphique permet" value={verdict.fps.gpuFps} target={goal.fps} limit={verdict.fps.limit === "gpu"} />
          <FpsBar label="Ton processeur permet" value={verdict.fps.cpuFps} target={goal.fps} limit={verdict.fps.limit === "cpu"} />
          <p className="muted small">
            Le PC va à la vitesse du plus lent des deux, dans un jeu récent en qualité élevée. Les jeux compétitifs (Valorant, CS2, Fortnite en
            réglages bas) tournent bien plus vite.
          </p>
        </div>
      )}
      {byPart ?? (
      <ul className="needs">
        {verdict.needs.map((n) => (
          <li key={n.id} className={`need n-${n.status}`}>
            <Icon name={STATUS_ICON[n.status]} />
            <div className="need-main">
              <div className="need-head">
                <b>{n.label}</b>
                <span className="muted">
                  {n.current}, objectif {n.target.charAt(0).toLowerCase() + n.target.slice(1)}
                </span>
              </div>
              <p className="muted small"><T>{n.detail}</T></p>
            </div>
            {n.fix && n.status !== "ok" && (
              <button className="link small" onClick={() => onUpgrades(n.fix)}>
                Voir les {FIX_LABEL[n.fix].toLowerCase()}
              </button>
            )}
          </li>
        ))}
      </ul>
      )}
    </>
  );
}

export function VerdictBanner({ verdict, onUpgrades, compact }: { verdict: Verdict; onUpgrades?: () => void; compact?: boolean }) {
  return (
    <div className={`verdict v-${verdict.level} ${compact ? "compact" : ""}`}>
      <Icon name={STATUS_ICON[verdict.level]} />
      <div className="verdict-text">
        <b>{verdict.title}</b>
        <span>{verdict.summary}</span>
      </div>
      {onUpgrades && verdict.level !== "ok" && (
        <button className="btn primary" onClick={onUpgrades}>
          Voir les solutions
        </button>
      )}
    </div>
  );
}

function FpsBar({ label, value, target, limit }: { label: string; value: number; target: number; limit: boolean }) {
  const max = Math.max(target * 1.6, value * 1.1);
  return (
    <div className="fpsbar">
      <div className="fpsbar-head">
        <span>
          {label} {limit && <em className="tag warn">facteur limitant</em>}
        </span>
        <b className="mono">≈ {value} i/s</b>
      </div>
      <div className="fpsbar-track">
        <i style={{ width: `${(value / max) * 100}%`, background: value >= target ? "var(--ok)" : value >= target * 0.8 ? "var(--warn)" : "var(--bad)" }} />
        <span className="fpsbar-target" style={{ left: `${(target / max) * 100}%` }} title={`Objectif ${target} i/s`} />
      </div>
    </div>
  );
}
