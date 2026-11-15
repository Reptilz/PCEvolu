import { T } from "../glossary";
import { useState, type ReactNode } from "react";
import type { Report } from "../types";
import {
  FPS_LABEL, RES_LABEL, USAGE_LABEL, fluidity, isGaming,
  type FpsTarget, type Goal, type NeedStatus, type Resolution, type Usage, type Verdict,
} from "./goal";
import { Icon, type IconName } from "../icons";
import type { OptimizeResult } from "./optimizer";
import { Alternatives, RecommendedPlan, Tiers, euros } from "./PlanView";
import { PriceNotice } from "./PriceSheet";
import { tr } from "../settings";

// ---------------------------------------------------------------------------
// Assistant « Mon objectif »
// ---------------------------------------------------------------------------

const usages = (): { id: Usage; icon: IconName; hint: string }[] => [
  { id: "office", icon: "folder", hint: tr("Internet, mails, Office, vidéos, visio", "Web, email, Office, videos, video calls") },
  { id: "gaming", icon: "gpu", hint: tr("Jeux récents, en solo ou en ligne", "Recent games, solo or online") },
  { id: "creation", icon: "spark", hint: tr("Montage vidéo, retouche photo, 3D", "Video editing, photo editing, 3D") },
  { id: "streaming", icon: "screen", hint: tr("Jouer et diffuser en direct (Twitch, YouTube)", "Play and stream live (Twitch, YouTube)") },
];

const resolutions = (): { id: Resolution; hint: string }[] => [
  { id: "1080p", hint: tr("Écrans 22 à 24 pouces, le plus courant", "22 to 24-inch screens, the most common") },
  { id: "1440p", hint: tr("Écrans 27 pouces : le bon compromis", "27-inch screens: the sweet spot") },
  { id: "4k", hint: tr("Grands écrans et TV : très exigeant", "Large screens and TVs: very demanding") },
];

const fpsChoices = (): { id: FpsTarget; title: string; hint: string }[] => [
  { id: 60, title: tr("Confort", "Comfortable"), hint: tr("Fluide pour les jeux solo et l'aventure", "Smooth for solo and adventure games") },
  { id: 100, title: tr("Très fluide", "Very smooth"), hint: tr("Pour profiter d'un écran 120-144 Hz", "To make the most of a 120-144 Hz screen") },
  { id: 144, title: tr("Compétitif", "Competitive"), hint: tr("FPS en ligne, esport : réactivité maximale", "Online shooters, esports: maximum responsiveness") },
];

/** Résolution et fréquence de l'écran principal, pour préremplir l'assistant. */
function detectedScreen(r: Report): { res?: Resolution; fps?: FpsTarget; label?: string } {
  const d = r.displays.find((x) => x.primary) ?? r.displays[0];
  if (!d) return {};
  const res: Resolution = d.height >= 2000 ? "4k" : d.height >= 1400 ? "1440p" : "1080p";
  const fps: FpsTarget = d.maxHz >= 140 ? 144 : d.maxHz >= 100 ? 100 : 60;
  return { res, fps, label: tr(`${d.width}×${d.height}, jusqu'à ${d.maxHz} Hz`, `${d.width}×${d.height}, up to ${d.maxHz} Hz`) };
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
          <h1>{tr("Que veux-tu faire avec ton PC ?", "What do you want to do with your PC?")}</h1>
          <p className="muted">{tr("PCEvolu adapte son diagnostic et ses conseils à ton usage.", "PCEvolu tailors its diagnosis and advice to how you use your PC.")}</p>
          <div className="choices four">
            {usages().map((u) => (
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
          <h1>{tr("En quelle résolution joues-tu ?", "What resolution do you play at?")}</h1>
          <p className="muted">
            {screen.label
              ? tr(`Ton écran : ${screen.label}.`, `Your screen: ${screen.label}.`)
              : tr("Choisis la définition de ton écran.", "Choose your screen's resolution.")}
          </p>
          <div className="choices">
            {resolutions().map((r) => (
              <button key={r.id} className={`choice ${g.resolution === r.id ? "on" : ""}`} onClick={() => pick({ resolution: r.id })}>
                <b>{RES_LABEL[r.id]}</b>
                <span>{r.hint}</span>
                {screen.res === r.id && <em className="tag">{tr("Ton écran", "Your screen")}</em>}
              </button>
            ))}
          </div>
        </>
      )}

      {step === "fps" && (
        <>
          <h1>{tr("Quelle fluidité vises-tu ?", "How smooth do you want it?")}</h1>
          <p className="muted">
            {tr(
              "En images par seconde (i/s), dans les jeux récents en qualité élevée.",
              "In frames per second (fps), in recent games at high quality.",
            )}
          </p>
          <div className="choices">
            {fpsChoices().map((f) => (
              <button key={f.id} className={`choice ${g.fps === f.id ? "on" : ""}`} onClick={() => pick({ fps: f.id })}>
                <b>
                  {f.title} · {FPS_LABEL[f.id]}
                </b>
                <span>{f.hint}</span>
                {screen.fps != null && f.id === 144 && screen.fps === 144 && <em className="tag">{tr("Ton écran monte à 144 Hz", "Your screen goes up to 144 Hz")}</em>}
              </button>
            ))}
          </div>
        </>
      )}

      {step === "budget" && (
        <>
          <h1>{tr("Quel budget maximum ?", "What's your maximum budget?")}</h1>
          <p className="muted">
            {tr(
              "PCEvolu te montrera d'abord ce qui rentre dans ce budget, pièces obligatoires comprises.",
              "PCEvolu will first show you what fits this budget, required parts included.",
            )}
          </p>
          <div className="budget">
            <div className="budget-value">{g.budget == null ? tr("Pas de limite", "No limit") : euros(g.budget)}</div>
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
                  {euros(b)}
                </button>
              ))}
              <button className={`chip-btn ${g.budget == null ? "on" : ""}`} onClick={() => pick({ budget: g.budget == null ? 800 : null })}>
                {tr("Pas de limite", "No limit")}
              </button>
            </div>
          </div>
        </>
      )}

      <div className="wiz-actions">
        {i > 0 ? (
          <button className="btn ghost" onClick={() => setI(i - 1)}>
            {tr("Retour", "Back")}
          </button>
        ) : onSkip ? (
          <button className="btn ghost" onClick={onSkip}>
            {tr("Plus tard", "Later")}
          </button>
        ) : (
          <span />
        )}
        <button className="btn primary" onClick={next}>
          {i + 1 < steps.length ? tr("Continuer", "Continue") : tr("Voir mon diagnostic", "See my diagnosis")}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Diagnostic
// ---------------------------------------------------------------------------

const STATUS_ICON: Record<NeedStatus, IconName> = { ok: "check", limited: "alert", missing: "cross" };
const fixLabel = (fix: string): string =>
  ({
    gpu: tr("Cartes graphiques", "Graphics cards"),
    cpu: tr("Processeurs", "Processors"),
    ram: tr("Mémoire", "Memory"),
    storage: tr("Stockage", "Storage"),
  } as Record<string, string>)[fix];

/** Phrase d'objectif : « Jeu en 2K à 100 i/s, budget 900 € ». */
export function goalSentence(g: Goal): string {
  const budget = g.budget == null ? tr("sans limite de budget", "no budget limit") : tr(`budget ${g.budget} €`, `budget ${euros(g.budget)}`);
  if (isGaming(g.usage)) {
    const what = g.usage === "streaming" ? tr("Jeu et streaming", "Gaming and streaming") : tr("Jeu", "Gaming");
    const res = RES_LABEL[g.resolution].split(" (")[0];
    return tr(`${what} en ${res} à ${g.fps} i/s, ${budget}`, `${what} at ${res} and ${g.fps} fps, ${budget}`);
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
    { id: "alternatives", label: tr("Autres options", "Other options"), count: plan?.alternatives.length },
    { id: "tiers", label: tr("Selon le budget", "By budget"), count: plan?.tiers.length },
    { id: "diagnostic", label: tr("Pièce par pièce", "Part by part") },
  ];

  return (
    <div className="goal-page">
      <header className="gp-head">
        <div>
          <h1>{tr("Mon plan", "My plan")}</h1>
          <p className="gp-goal">{goalSentence(goal)}</p>
        </div>
        <button className="btn ghost" onClick={onEdit}>
          {tr("Modifier", "Edit")}
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
          {tr("Aujourd'hui : ", "Today: ")}<b>{fluidity(today).toLowerCase()}</b>{" "}
          <span className="num">{tr(`(≈ ${today} i/s)`, `(≈ ${today} fps)`)}</span>
          {tr(", limité par ", ", limited by ")}
          {limit === "gpu" ? tr("la carte graphique", "the graphics card") : tr("le processeur", "the processor")}
        </span>
        {after != null && after > today && (
          <span className="gauge-legend-after">
            {tr("Avec le plan : ", "With the plan: ")}<b>{fluidity(after).toLowerCase()}</b>{" "}
            <span className="num">{tr(`(≈ ${after} i/s)`, `(≈ ${after} fps)`)}</span>
          </span>
        )}
        <span className="gauge-legend-goal">
          {tr("Objectif : ", "Goal: ")}<b>{fluidity(goal).toLowerCase()}</b>{" "}
          <span className="num">{tr(`(${goal} i/s)`, `(${goal} fps)`)}</span>
        </span>
      </div>
    </div>
  );
}

function Diagnostic({ goal, verdict, onUpgrades, byPart }: { goal: Goal; verdict: Verdict; onUpgrades: (tab?: string) => void; byPart?: ReactNode }) {
  return (
    <>
      {verdict.fps && (
        <section className="limiter">
          <h3 className="limiter-title">{tr("Qui limite ton PC ?", "What's holding your PC back?")}</h3>
          <p className="limiter-sub">
            {tr(
              "Le PC va à la vitesse du plus lent des deux, dans un jeu récent en qualité élevée. Les jeux compétitifs (Valorant, CS2, Fortnite en réglages bas) tournent bien plus vite.",
              "Your PC runs at the speed of the slower of the two, in a recent game at high quality. Competitive games (Valorant, CS2, Fortnite on low settings) run much faster.",
            )}
          </p>
          {(() => {
            const max = Math.max(goal.fps * 1.35, verdict.fps.gpuFps * 1.08, verdict.fps.cpuFps * 1.08);
            return (
              <div className="limiter-bars">
                <FpsBar icon="gpu" label={tr("Carte graphique", "Graphics card")} value={verdict.fps.gpuFps} target={goal.fps} max={max} limit={verdict.fps.limit === "gpu"} />
                <FpsBar icon="chip" label={tr("Processeur", "Processor")} value={verdict.fps.cpuFps} target={goal.fps} max={max} limit={verdict.fps.limit === "cpu"} />
                <div className="limiter-goal" style={{ left: `calc(var(--lim-label) + (100% - var(--lim-label) - var(--lim-value)) * ${goal.fps / max})` }}>
                  <span>{tr(`Objectif ${goal.fps} i/s`, `Goal ${goal.fps} fps`)}</span>
                </div>
              </div>
            );
          })()}
        </section>
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
                  {tr(
                    `${n.current}, objectif ${n.target.charAt(0).toLowerCase() + n.target.slice(1)}`,
                    `${n.current}, goal ${n.target.charAt(0).toLowerCase() + n.target.slice(1)}`,
                  )}
                </span>
              </div>
              <p className="muted small"><T>{n.detail}</T></p>
            </div>
            {n.fix && n.status !== "ok" && (
              <button className="link small" onClick={() => onUpgrades(n.fix)}>
                {tr(`Voir les ${fixLabel(n.fix).toLowerCase()}`, `See ${fixLabel(n.fix).toLowerCase()}`)}
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
          {tr("Voir les solutions", "See the solutions")}
        </button>
      )}
    </div>
  );
}

/** Une ligne « composant → ce qu'il permet », sur une échelle commune avec l'objectif. */
function FpsBar({ icon, label, value, target, max, limit }: { icon: IconName; label: string; value: number; target: number; max: number; limit: boolean }) {
  const state = value >= target ? "ok" : limit ? "limit" : "short";
  return (
    <div className={`lim-row s-${state}`}>
      <span className="lim-label">
        <Icon name={icon} />
        <span>
          {label}
          {limit && <span className="lim-flag">{tr("Le plus lent", "The slowest")}</span>}
        </span>
      </span>
      <span className="lim-track">
        <i style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
      </span>
      <span className="lim-value">
        <b>{fluidity(value)}</b>
        <span className="num">{tr(`≈ ${value} i/s`, `≈ ${value} fps`)}</span>
      </span>
    </div>
  );
}
