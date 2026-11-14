import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Metrics, Report } from "./types";
import { recommend, type Recommendation } from "./recommendations";
import { demoMetrics, demoReport } from "./demo";
import { clean, date, diskSize, gb, ghz, speed, uptime } from "./format";
import { BrandLogo, hasBrandLogo, Icon, type IconName } from "./icons";
import { T } from "./glossary";
import { UpgradesView } from "./upgrade/UpgradesView";
import { buildProfile, loadAnswers, type Answers } from "./upgrade/profile";
import { assess, loadGoal, saveGoal, topOptions, type Goal, type Verdict } from "./upgrade/goal";

type OptionList = ReturnType<typeof topOptions>;
import { GoalDiagnostic, GoalWizard } from "./upgrade/GoalViews";
import { proposeAll } from "./upgrade/engine";
import { optimize } from "./upgrade/optimizer";
import { loadHistory, loadPrices } from "./upgrade/prices";
import { loadCatalog } from "./upgrade/catalog-remote";
import { checkAlerts, isTriggered, loadAlerts, saveAlerts, type PriceAlert } from "./upgrade/alerts";
import { PriceContext, PriceSheet, type SheetPart } from "./upgrade/PriceSheet";
import { AlertsView } from "./upgrade/AlertsView";

type View = "overview" | "goal" | "improve" | "upgrades" | "alerts";

const inApp = isTauri();

async function loadReport(): Promise<Report> {
  if (!inApp) return new Promise((res) => setTimeout(() => res(demoReport), 600));
  return invoke<Report>("scan");
}

async function loadMetrics(): Promise<Metrics> {
  return inApp ? invoke<Metrics>("metrics") : demoMetrics();
}

export default function App() {
  const [view, setView] = useState<View>("overview");
  const [report, setReport] = useState<Report>();
  const [error, setError] = useState<string>();
  const [scanning, setScanning] = useState(false);
  const [live, setLive] = useState<Metrics>();
  const [scannedAt, setScannedAt] = useState<Date>();
  const [answers, setAnswers] = useState<Answers>(loadAnswers);
  const [goal, setGoal] = useState<Goal>(loadGoal);
  // L'assistant s'ouvre au premier lancement, tant que l'objectif n'est pas défini.
  const [wizardOpen, setWizardOpen] = useState(() => !loadGoal().configured);
  const [upgradeTab, setUpgradeTab] = useState<string>();
  // Incrémenté quand de nouveaux prix du marché sont appliqués, pour recalculer les propositions.
  const [pricesVersion, setPricesVersion] = useState(0);
  const [alerts, setAlerts] = useState<PriceAlert[]>(loadAlerts);
  const [sheet, setSheet] = useState<SheetPart>();

  useEffect(() => {
    // Catalogue d'abord (il peut ajouter des composants), puis les prix du marché,
    // puis l'historique et la vérification des alertes de prix.
    loadCatalog()
      .then(() => loadPrices())
      .then(async () => {
        setPricesVersion((v) => v + 1);
        loadHistory().then(() => setPricesVersion((v) => v + 1));
        const checked = await checkAlerts(loadAlerts());
        saveAlerts(checked);
        setAlerts(checked);
      });
  }, []);
  const triggeredCount = alerts.filter(isTriggered).length;

  const scan = useCallback(async () => {
    setScanning(true);
    setError(undefined);
    try {
      setReport(await loadReport());
      setScannedAt(new Date());
    } catch (e) {
      setError(String(e));
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    scan();
  }, [scan]);

  useEffect(() => {
    let alive = true;
    const tick = () => loadMetrics().then((m) => alive && setLive(m)).catch(() => {});
    tick();
    const id = setInterval(tick, 2000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const recos = useMemo(() => (report ? recommend(report, live) : []), [report, live]);
  const profile = useMemo(() => (report ? buildProfile(report, answers) : undefined), [report, answers]);
  const verdict = useMemo(() => (report && profile ? assess(goal, profile, report) : undefined), [report, profile, goal]);
  // Plan d'évolution : toutes les combinaisons d'upgrades, recalculées quand l'objectif, le budget ou les prix changent.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const proposals = useMemo(() => (profile ? proposeAll(profile) : undefined), [profile, pricesVersion]);
  // 3 options vérifiées par catégorie, dans le budget, pour l'onglet Améliorations.
  const options = useMemo(() => {
    if (!profile || !proposals || !verdict) return undefined;
    const o: Record<string, OptionList> = {};
    for (const cat of ["gpu", "cpu", "ram", "storage"] as const) o[cat] = topOptions(goal, profile, verdict, proposals[cat] as never, cat);
    return o;
  }, [profile, proposals, verdict, goal]);
  const plan = useMemo(
    () => (report && profile && proposals && goal.configured ? optimize(goal, profile, report, proposals) : undefined),
    [report, profile, proposals, goal],
  );
  const setBudget = (budget: number | null) => {
    const g = { ...goal, budget };
    saveGoal(g);
    setGoal(g);
  };

  const finishWizard = (g: Goal) => {
    saveGoal(g);
    setGoal(g);
    setWizardOpen(false);
    setView("goal");
  };
  const openUpgrades = (tab?: string) => {
    setUpgradeTab(tab);
    setView("upgrades");
  };
  /** Change de page ; « Mon plan » ouvre d'abord l'assistant si aucun objectif n'est défini. */
  const go = (v: View) => {
    if (v === "goal" && !goal.configured) return setWizardOpen(true);
    setWizardOpen(false);
    setView(v);
    document.querySelector(".main")?.scrollTo({ top: 0 });
  };
  const freeCount = recos.filter((r) => !r.upgrade).length;

  return (
    <PriceContext.Provider value={{ open: setSheet, alerts, setAlerts }}>
    <div className="app">
      <aside className="side">
        <div className="brand">
          <div className="logo">
            <Icon name="up" />
          </div>
          <div>
            <div className="brand-name">PCEvolu</div>
            <div className="brand-sub">Analyse & upgrades</div>
          </div>
        </div>
        <nav>
          <div className="nav-group">1. Mon PC</div>
          <NavItem icon="grid" label="Mon PC" sub="État et composants" active={view === "overview" && !wizardOpen} onClick={() => go("overview")} />
          <div className="nav-group">2. L'améliorer</div>
          <NavItem icon="spark" label="Réglages gratuits" sub="Sans rien acheter" active={view === "improve" && !wizardOpen} onClick={() => go("improve")} count={freeCount} />
          <NavItem icon="target" label="Mon plan" sub="Quoi acheter, et pourquoi" active={view === "goal" || wizardOpen} onClick={() => go("goal")} />
          <NavItem icon="cart" label="Toutes les pièces" sub="Catalogue compatible" active={view === "upgrades" && !wizardOpen} onClick={() => go("upgrades")} />
          <div className="nav-group">3. Suivre</div>
          <NavItem icon="bell" label="Alertes prix" sub="Le bon moment pour acheter" active={view === "alerts" && !wizardOpen} onClick={() => go("alerts")} count={triggeredCount} />
        </nav>
        <div className="side-foot">
          <button className="btn" onClick={scan} disabled={scanning}>
            <Icon name="refresh" className={scanning ? "spin" : ""} />
            {scanning ? "Analyse…" : "Réanalyser"}
          </button>
          <div className="muted small">
            {scannedAt ? `Dernière analyse à ${scannedAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : " "}
            {!inApp && <div className="demo-flag">Mode démo (navigateur)</div>}
          </div>
        </div>
      </aside>

      <main className="main">
        {error && (
          <div className="error">
            <b>L'analyse a échoué.</b> {error}
          </div>
        )}
        {!report && !error && <Loading />}
        {report && wizardOpen && <GoalWizard report={report} goal={goal} onDone={finishWizard} onSkip={() => setWizardOpen(false)} />}
        {report && !wizardOpen && view === "overview" && (
          <Overview report={report} live={live} recos={recos} go={go} verdict={goal.configured ? verdict : undefined} onSetGoal={() => setWizardOpen(true)} />
        )}
        {report && !wizardOpen && view === "goal" && verdict && (
          <GoalDiagnostic
            goal={goal}
            verdict={verdict}
            plan={plan}
            onBudget={setBudget}
            onEdit={() => setWizardOpen(true)}
            onUpgrades={openUpgrades}
            byPart={<BuyList recos={recos} openTab={openUpgrades} options={options} goal={goal} verdict={verdict} />}
            next={<NextStep hint="Pas pressé ? PCEvolu peut te prévenir quand ces pièces baissent." label="Étape suivante : mes alertes prix" onClick={() => go("alerts")} />}
          />
        )}
        {report && !wizardOpen && view === "improve" && (
          <FreeView
            recos={recos}
            next={
              <NextStep
                hint={goal.configured ? "Ensuite, ce qu'il vaut la peine d'acheter pour ton objectif." : "Ensuite, dis à PCEvolu ce que tu veux faire de ton PC : il te dira quoi acheter."}
                label={goal.configured ? "Étape suivante : mon plan" : "Étape suivante : définir mon objectif"}
                onClick={() => go("goal")}
              />
            }
          />
        )}
        {report && !wizardOpen && view === "upgrades" && verdict && (
          <UpgradesView
            report={report}
            answers={answers}
            setAnswers={setAnswers}
            pricesVersion={pricesVersion}
            goal={goal}
            verdict={verdict}
            initialTab={upgradeTab}
            onEditGoal={() => setWizardOpen(true)}
          />
        )}
        {report && !wizardOpen && view === "upgrades" && (
          <NextStep hint="Une pièce te plaît mais tu préfères attendre ? Crée une alerte depuis son prix." label="Étape suivante : mes alertes prix" onClick={() => go("alerts")} />
        )}
        {!wizardOpen && view === "alerts" && <AlertsView onPlan={() => go("goal")} />}
      </main>
    </div>
      {sheet && <PriceSheet part={sheet} onClose={() => setSheet(undefined)} />}
    </PriceContext.Provider>
  );
}

function NavItem(p: { icon: IconName; label: string; sub?: string; active: boolean; onClick: () => void; count?: number }) {
  return (
    <button className={`nav ${p.active ? "on" : ""}`} onClick={p.onClick} aria-current={p.active ? "page" : undefined}>
      <Icon name={p.icon} />
      <span className="nav-text">
        <span className="nav-label">{p.label}</span>
        {p.sub && <span className="nav-sub">{p.sub}</span>}
      </span>
      {!!p.count && <span className="count">{p.count}</span>}
    </button>
  );
}

function Loading() {
  return (
    <div className="loading">
      <div className="pulse" />
      <div>Analyse de ton PC en cours…</div>
      <div className="muted small">Lecture du processeur, de la mémoire, des disques et des écrans</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vue d'ensemble
// ---------------------------------------------------------------------------

function Overview({
  report: r, live, recos, go, verdict, onSetGoal,
}: { report: Report; live?: Metrics; recos: Recommendation[]; go: (v: View) => void; verdict?: Verdict; onSetGoal: () => void }) {
  const cpu = r.cpus[0];
  const gpu = r.gpus[0];
  const sys = r.volumes.find((v) => v.letter === "C:") ?? r.volumes[0];
  const ramPct = live?.ramUsedBytes && live.ramTotalBytes ? (live.ramUsedBytes / live.ramTotalBytes) * 100 : undefined;
  const diskPct = sys?.sizeBytes && sys.freeBytes != null ? ((sys.sizeBytes - sys.freeBytes) / sys.sizeBytes) * 100 : undefined;
  const score = healthScore(recos);
  const freeCount = recos.filter((x) => !x.upgrade).length;

  return (
    <div className="ov-page">
      <header className="gp-head">
        <div>
          <h1>{clean(r.board.product) || r.system.model || "Mon PC"}</h1>
          <p className="gp-goal">
            {r.os.name} (build {r.os.build}), allumé depuis {uptime(live?.uptimeSecs)}.
          </p>
        </div>
        <div className={`ov-score s-${score.level}`} title="Note calculée à partir des améliorations restantes">
          <span className="num">{score.value}</span>
          <span>{score.label}</span>
        </div>
      </header>

      {verdict ? (
        <section className="answer ov-answer">
          <h2 className="answer-title">{verdict.title}</h2>
          <p className="ov-answer-sub">{verdict.summary}</p>
          <button className="btn primary" onClick={() => go("goal")}>
            Voir mon plan
          </button>
        </section>
      ) : (
        <section className="answer ov-answer">
          <h2 className="answer-title">Dis-nous ce que tu veux faire de ton PC</h2>
          <p className="ov-answer-sub">Jeu, bureautique, création, et ton budget : PCEvolu te dit si ton PC suffit et quoi améliorer en priorité.</p>
          <button className="btn primary" onClick={onSetGoal}>
            Définir mon objectif
          </button>
        </section>
      )}

      <section className="kpis">
        <Kpi label="Processeur" value={live?.cpuPercent} unit="%" sub={clean(cpu?.name)} />
        <Kpi label="Mémoire" value={ramPct} unit="%" sub={`${gb(live?.ramUsedBytes, 1)} sur ${gb(r.memory.totalBytes)}`} warnAt={85} />
        <Kpi label="Carte graphique" value={live?.gpu?.usagePercent} unit="%" sub={live?.gpu?.tempC != null ? `${clean(gpu?.name)}, ${Math.round(live.gpu.tempC)} °C` : clean(gpu?.name)} accent="var(--nv)" />
        <Kpi label={`Disque ${sys?.letter ?? ""}`} value={diskPct} unit="%" sub={`${gb(sys?.freeBytes)} libres`} warnAt={85} />
      </section>

      <div className="ov-split">
        <section>
          <h2 className="imp-h">À faire en priorité</h2>
          {recos.length === 0 ? (
            <p className="muted">Rien à signaler : ton PC est bien configuré.</p>
          ) : (
            <>
              <ul className="imp-list">
                {recos.slice(0, 3).map((x) => (
                  <RecoLine key={x.id} r={x} />
                ))}
              </ul>
              <button className="link" onClick={() => go("improve")}>
                {recos.length > 3 ? `Voir les ${recos.length} améliorations` : "Voir le détail et ce qu'il faut acheter"}
              </button>
            </>
          )}
        </section>
        <section>
          <h2 className="imp-h">Ton PC</h2>
          <ul className="facts">
            <Fact icon="chip" k="Processeur" v={`${clean(cpu?.name)}, ${cpu?.cores ?? "?"} cœurs`} />
            <Fact icon="gpu" k="Carte graphique" v={`${clean(gpu?.name)}, ${gb(gpu?.vramBytes)}`} />
            <Fact icon="ram" k="Mémoire" v={`${gb(r.memory.totalBytes)} ${r.memory.modules[0]?.kind ?? ""}, ${r.memory.modules.length} barrette${r.memory.modules.length > 1 ? "s" : ""} sur ${r.memory.slotsTotal ?? "?"}`} />
            <Fact icon="disk" k="Stockage" v={r.disks.map((d) => `${diskSize(d.sizeBytes)} ${d.media}`).join(" + ") || "—"} />
            <Fact icon="screen" k="Écran" v={r.displays.map((d) => `${d.width}×${d.height} à ${d.currentHz} Hz`).join(", ") || "—"} />
            <Fact icon="board" k="Carte mère" v={clean(r.board.product)} />
          </ul>
          <button className="link" onClick={() => document.getElementById("fiche-technique")?.scrollIntoView({ behavior: "smooth" })}>
            Voir la fiche technique complète
          </button>
        </section>
      </div>

      <section className="ov-tech" id="fiche-technique">
        <h2 className="imp-h">Fiche technique</h2>
        <Components report={r} live={live} />
      </section>

      {verdict ? (
        <NextStep
          hint={freeCount ? `Commence par les ${freeCount} réglage${freeCount > 1 ? "s" : ""} gratuit${freeCount > 1 ? "s" : ""}, puis regarde ce qu'il vaut la peine d'acheter.` : undefined}
          label={freeCount ? "Étape suivante : réglages gratuits" : "Étape suivante : mon plan"}
          onClick={() => go(freeCount ? "improve" : "goal")}
        />
      ) : (
        <NextStep label="Étape suivante : définir mon objectif" onClick={onSetGoal} />
      )}
    </div>
  );
}

function healthScore(recos: Recommendation[]) {
  const penalty = recos.reduce((s, r) => s + (r.level === "high" ? 18 : r.level === "medium" ? 9 : 3), 0);
  const value = Math.max(0, 100 - penalty);
  if (value >= 85) return { value, label: "Excellent", level: "ok" };
  if (value >= 65) return { value, label: "Bon, à optimiser", level: "warn" };
  return { value, label: "À améliorer", level: "bad" };
}

function Kpi(p: { label: string; value?: number; unit: string; sub?: string; warnAt?: number; accent?: string }) {
  const v = p.value == null ? undefined : Math.max(0, Math.min(100, p.value));
  const color = p.warnAt && v != null && v >= p.warnAt ? "var(--warn)" : p.accent ?? "var(--accent)";
  return (
    <div className="kpi">
      <div className="kpi-l">{p.label}</div>
      <div className="kpi-v">
        {v == null ? "—" : Math.round(v)}
        <small>{v == null ? "" : ` ${p.unit}`}</small>
      </div>
      <div className="bar">
        <i style={{ width: `${v ?? 0}%`, background: color }} />
      </div>
      <div className="kpi-s">{p.sub || " "}</div>
    </div>
  );
}

function Fact({ icon, k, v }: { icon: IconName; k: string; v?: string }) {
  return (
    <li>
      <span className="fact-k">
        <Icon name={icon} />
        {k}
      </span>
      <span className="fact-v">{v || "—"}</span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Réglages gratuits, et achats pièce par pièce (affichés dans « Mon plan »)
// ---------------------------------------------------------------------------

/** Onglet de l'écran « Toutes les pièces » correspondant à une suggestion d'achat. */
const UPGRADE_TAB: Record<string, string> = { "Mémoire vive": "ram", Stockage: "storage", "Carte graphique": "gpu", Processeur: "cpu" };

/** Bouton « Étape suivante », en bas de chaque page : on sait toujours où aller ensuite. */
function NextStep({ label, hint, onClick }: { label: string; hint?: string; onClick: () => void }) {
  return (
    <div className="next-step">
      {hint && <p className="next-hint">{hint}</p>}
      <button className="btn next-btn" onClick={onClick}>
        {label}
        <Icon name="chevron" className="next-ico" />
      </button>
    </div>
  );
}

function FreeView({ recos, next }: { recos: Recommendation[]; next: ReactNode }) {
  const free = recos.filter((r) => !r.upgrade);
  return (
    <div className="imp-page">
      <header className="gp-head">
        <div>
          <h1>Réglages gratuits</h1>
          <p className="gp-goal">Ce que tu peux améliorer tout de suite, sans rien acheter.</p>
        </div>
      </header>
      {free.length === 0 ? (
        <p className="muted">Rien à régler : ton PC est déjà bien configuré.</p>
      ) : (
        <ul className="imp-list">
          {free.map((r) => (
            <RecoLine key={r.id} r={r} detail />
          ))}
        </ul>
      )}
      {next}
    </div>
  );
}

/** Les achats pièce par pièce : ce qui bloque l'objectif, puis les suggestions générales, avec les options vérifiées. */
function BuyList({ recos, openTab, options, goal, verdict }: {
  recos: Recommendation[]; openTab: (tab: string) => void; options?: Record<string, OptionList>; goal: Goal; verdict?: Verdict;
}) {
  const upgrades = recos.filter((r) => r.upgrade);
  type Buy = { id: string; tab: string; kind: string; title: string; why: string; price?: string; goal: boolean };
  const buys: Buy[] = [];
  if (goal.configured && verdict) {
    for (const n of verdict.needs) {
      if (!n.fix || n.status === "ok" || buys.some((b) => b.tab === n.fix)) continue;
      const kind = upgrades.find((u) => UPGRADE_TAB[u.upgrade!.component] === n.fix)?.upgrade!.component ?? n.label;
      buys.push({ id: n.id, tab: n.fix, kind, title: `${n.current}, il faudrait ${n.target.charAt(0).toLowerCase()}${n.target.slice(1)}`, why: n.detail, goal: true });
    }
  }
  for (const r of upgrades) {
    const tab = UPGRADE_TAB[r.upgrade!.component] ?? "gpu";
    const existing = buys.find((b) => b.tab === tab);
    if (existing) {
      existing.price ??= price(r.upgrade!.priceMin, r.upgrade!.priceMax);
      continue;
    }
    buys.push({ id: r.id, tab, kind: r.upgrade!.component, title: r.upgrade!.suggestion, why: r.detail, price: price(r.upgrade!.priceMin, r.upgrade!.priceMax), goal: false });
  }
  if (buys.length === 0) return <p className="muted">Aucune pièce ne limite ton PC pour cet objectif.</p>;

  return (
    <div className="parts">
      {buys.map((b) => {
        const opts = options?.[b.tab] ?? [];
        return (
          <section key={b.id} className={`part-card ${b.goal ? "blocking" : ""}`}>
            <header className="part-head">
              <span className="part-ico">
                <Icon name={TAB_ICON[b.tab] ?? "spark"} />
              </span>
              <div className="part-main">
                <div className="part-kind">
                  {b.kind}
                  {b.goal && <span className="part-flag">Bloque ton objectif</span>}
                </div>
                <div className="part-title">{b.title}</div>
                <p className="part-why">
                  <T>{b.why}</T>
                </p>
              </div>
              {b.price && (
                <span className="part-price">
                  <span className="muted">Budget</span>
                  <b className="num">{b.price}</b>
                </span>
              )}
            </header>

            {opts.length > 0 ? (
              <ul className="part-opts">
                {opts.map((o) => {
                  const main = (o.proposal as unknown as { main: { brand?: string } }).main;
                  return (
                    <li key={o.proposal.id}>
                      <button className="part-opt" onClick={() => openTab(b.tab)}>
                        <span className="part-opt-name">
                          {hasBrandLogo(main?.brand) ? <BrandLogo brand={main.brand} /> : <Icon name={TAB_ICON[b.tab] ?? "spark"} />}
                          {(o.proposal as unknown as { title: string }).title}
                        </span>
                        <span className={`part-opt-effect ${o.impact.reachesGoal ? "ok" : ""}`}>
                          {o.impact.reachesGoal ? "Atteint ton objectif" : o.impact.label}
                        </span>
                        <span className="part-opt-price num">{o.proposal.total} €</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              b.goal && (
                <p className="part-none">
                  Aucune pièce seule ne suffit dans ton budget : le plan conseillé, en haut de la page, en combine plusieurs.
                </p>
              )
            )}

            <footer className="part-foot">
              <button className="link" onClick={() => openTab(b.tab)}>
                Voir toutes les options compatibles
              </button>
            </footer>
          </section>
        );
      })}
    </div>
  );
}

const TAB_ICON: Record<string, IconName> = { gpu: "gpu", cpu: "chip", ram: "ram", storage: "disk" };

const price = (a?: number, b?: number) => (a == null ? "—" : a === b || b == null ? `${a} €` : `${a} à ${b} €`);

/** L'icône du composant concerné par une amélioration (écran, mémoire, BIOS…). */
function recoIcon(id: string): IconName {
  if (id.startsWith("hz-")) return "screen";
  if (id.startsWith("ram-")) return "ram";
  if (id.startsWith("disk-") || id === "no-ssd" || id.startsWith("vol-")) return "disk";
  if (id.startsWith("gpu-")) return "gpu";
  if (id === "bios-old") return "board";
  if (id.startsWith("net-")) return "wifi";
  return "spark";
}

/** Une amélioration en une ligne : titre, et le détail si demandé. */
function RecoLine({ r, detail }: { r: Recommendation; detail?: boolean }) {
  return (
    <li className={`imp-item l-${r.level}`}>
      <span className="imp-ico" aria-hidden>
        <Icon name={recoIcon(r.id)} />
      </span>
      <div>
        <div className="imp-title">
          <T>{r.title}</T>
        </div>
        {detail ? (
          <p className="imp-why">
            <T>{r.detail}</T>
          </p>
        ) : (
          <div className="imp-tag">{r.tag.replace(/ · /g, ", ")}</div>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Composants
// ---------------------------------------------------------------------------

function Components({ report: r, live }: { report: Report; live?: Metrics }) {
  const mods = r.memory.modules;
  const slots = Math.max(r.memory.slotsTotal ?? mods.length, mods.length);

  return (
    <>
      <p className="muted ov-tech-sub">
        {r.system.isLaptop ? "PC portable" : "PC fixe"}
        {r.system.manufacturer && !/to be filled|default/i.test(r.system.manufacturer) ? ` ${r.system.manufacturer.replace(/,? (Co\.,? )?(Ltd|Inc|Corp)\.?$/i, "")}` : ""}, tel que Windows le voit.
      </p>

      <div className="grid">
        {r.cpus.map((c, i) => (
          <Card key={i} icon="chip" cat="Processeur" name={clean(c.name)}>
            <Row k="Cœurs / threads" v={`${c.cores ?? "?"} / ${c.threads ?? "?"}`} />
            <Row k="Fréquence de base" v={ghz(c.baseMhz)} />
            <Row k="Cache L2 / L3" v={`${kb(c.l2Kb)} / ${kb(c.l3Kb)}`} />
            <Row k="Charge actuelle" v={live?.cpuPercent != null ? `${Math.round(live.cpuPercent)} %` : "—"} />
            <Row k="Virtualisation" v={c.virtualization == null ? "—" : c.virtualization ? "Activée" : "Désactivée"} badge={c.virtualization ? "ok" : undefined} />
          </Card>
        ))}

        {r.gpus.map((g, i) => (
          <Card key={i} icon="gpu" cat="Carte graphique" name={clean(g.name)} accent="var(--nv)">
            <Row k="Mémoire vidéo" v={gb(g.vramBytes)} />
            {i === 0 && live?.gpu && (
              <>
                <Row k="Température" v={live.gpu.tempC != null ? `${Math.round(live.gpu.tempC)} °C` : "—"} badge={live.gpu.tempC != null ? (live.gpu.tempC > 83 ? "bad" : "ok") : undefined} />
                <Row k="Utilisation" v={live.gpu.usagePercent != null ? `${Math.round(live.gpu.usagePercent)} %` : "—"} />
                <Row k="Consommation" v={live.gpu.powerW != null ? `${live.gpu.powerW.toFixed(1)} W` : "—"} />
              </>
            )}
            <Row k="Pilote" v={g.driverVersion} />
            <Row k="Date du pilote" v={date(g.driverDate)} />
          </Card>
        ))}

        <Card icon="ram" cat="Mémoire vive" name={`${gb(r.memory.totalBytes)} ${mods[0]?.kind ?? ""} ${mods[0]?.manufacturer ?? ""}`}>
          <Row k="Vitesse" v={mods[0]?.configuredMts ? `${mods[0].configuredMts} MT/s` : "—"} />
          <Row k="Mode" v={mods.length >= 2 ? "Dual channel" : "Single channel"} badge={mods.length >= 2 ? "ok" : "warn"} />
          <Row k="Maximum supporté" v={gb(r.memory.maxCapacityBytes)} />
          {mods[0]?.partNumber && <Row k="Référence" v={mods[0].partNumber} />}
          <div className="slots">
            {Array.from({ length: slots }, (_, i) => {
              const m = mods[i];
              return (
                <div key={i} className={`slot ${m ? "on" : ""}`} title={m?.slot}>
                  {m ? gb(m.capacityBytes) : "Libre"}
                </div>
              );
            })}
          </div>
        </Card>

        <Card icon="board" cat="Carte mère" name={clean(r.board.product)} brand={r.board.manufacturer}>
          <Row k="Fabricant" v={r.board.manufacturer?.replace(" Co., Ltd.", "")} logo />
          <Row k="Révision" v={r.board.version} />
          <Row k="BIOS" v={`${r.board.biosVersion ?? "?"}, du ${date(r.board.biosDate)}`} />
          <Row k="Éditeur du BIOS" v={r.board.biosVendor} />
        </Card>

        {r.disks.map((d, i) => (
          <Card key={i} icon="disk" cat="Stockage" name={d.name ?? "Disque"}>
            <Row k="Type" v={`${d.media} ${d.bus}`} />
            <Row k="Capacité" v={diskSize(d.sizeBytes)} />
            <Row k="État" v={health(d.health)} badge={d.health === "healthy" ? "ok" : d.health === "unknown" ? undefined : "bad"} />
          </Card>
        ))}

        <Card icon="folder" cat="Volumes" noBrand name={`${r.volumes.length} lecteur${r.volumes.length > 1 ? "s" : ""}`}>
          {r.volumes.map((v) => {
            const pct = v.sizeBytes && v.freeBytes != null ? ((v.sizeBytes - v.freeBytes) / v.sizeBytes) * 100 : 0;
            return (
              <div key={v.letter} className="vol">
                <div className="vol-head">
                  <span>
                    <b>{v.letter}</b> {v.label}
                  </span>
                  <span className="mono">
                    {gb(v.freeBytes)} libres / {gb(v.sizeBytes)}
                  </span>
                </div>
                <div className="bar">
                  <i style={{ width: `${pct}%`, background: pct > 85 ? "var(--warn)" : "var(--accent)" }} />
                </div>
              </div>
            );
          })}
        </Card>

        {r.displays.map((d, i) => {
          const m = r.monitors[i];
          return (
            <Card key={d.device} icon="screen" cat="Écran" name={m ? `${m.maker ?? ""} ${m.model ?? ""}`.trim() : d.adapter} brand={m?.maker ?? ""}>
              <Row k="Résolution" v={`${d.width} × ${d.height}`} />
              <Row k="Fréquence actuelle" v={`${d.currentHz} Hz`} badge={d.maxHz - d.currentHz >= 10 ? "bad" : "ok"} />
              <Row k="Fréquence max" v={`${d.maxHz} Hz`} />
              {m?.year && <Row k="Fabrication" v={String(m.year)} />}
              <Row k="Branché sur" v={clean(d.adapter)} logo />
            </Card>
          );
        })}

        <Card icon="wifi" cat="Réseau" name={clean(r.network.find((n) => n.connected)?.description) || "Cartes réseau"}>
          {r.network.length === 0 && <Row k="Cartes physiques" v="Aucune détectée" />}
          {r.network.map((n) => (
            <Row key={n.name} k={`${n.wireless ? "Wi-Fi" : "Ethernet"} (${n.name ?? ""})`} v={n.connected ? speed(n.speedBps) : "Déconnecté"} badge={n.connected ? "ok" : undefined} />
          ))}
        </Card>

        <Card icon="audio" cat="Audio" name={r.audio[0]?.name ?? "Périphériques audio"}>
          {r.audio.map((a, i) => (
            <Row key={i} k={a.name ?? "?"} v={a.manufacturer} logo />
          ))}
        </Card>
      </div>
    </>
  );
}

const kb = (v?: number) => (v == null ? "—" : v >= 1024 ? `${(v / 1024).toLocaleString("fr-FR")} Mo` : `${v} Ko`);
const health = (h: string) => ({ healthy: "Sain", warning: "Avertissement", unhealthy: "Défaillant", unknown: "Inconnu" })[h] ?? h;

/** Carte de la fiche technique. L'icône devient le logo du fabricant quand on le reconnaît (dans `brand`, sinon dans le nom). */
function Card(p: { icon: IconName; cat: string; name?: string; brand?: string; noBrand?: boolean; accent?: string; children: ReactNode }) {
  const brand = p.noBrand ? undefined : p.brand ?? p.name;
  const logo = hasBrandLogo(brand);
  return (
    <div className="card">
      <div className="card-top">
        <div className={`ico ${logo ? "ico-brand" : ""}`} style={p.accent && !logo ? { color: p.accent } : undefined}>
          {logo ? <BrandLogo brand={brand} /> : <Icon name={p.icon} />}
        </div>
        <div>
          <div className="cat">{p.cat}</div>
          <div className="name">{p.name || "—"}</div>
        </div>
      </div>
      <dl>{p.children}</dl>
    </div>
  );
}

function Row({ k, v, badge, logo }: { k: string; v?: string; badge?: "ok" | "warn" | "bad"; logo?: boolean }) {
  const label = { ok: "OK", warn: "À améliorer", bad: "À corriger" };
  return (
    <>
      <dt>{k}</dt>
      <dd>
        {logo && <BrandLogo brand={v} className="dd-logo" />}
        {v || "—"}
        {badge && badge !== "ok" && <span className={`badge b-${badge}`}>{label[badge]}</span>}
      </dd>
    </>
  );
}
