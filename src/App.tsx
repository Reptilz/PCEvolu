import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Metrics, Report } from "./types";
import { recommend, type Recommendation } from "./recommendations";
import { demoMetrics, demoReport } from "./demo";
import { clean, date, diskSize, gb, ghz, locale, speed, uptime } from "./format";
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
import { catalogText } from "./upgrade/catalog";
import { checkAlerts, isTriggered, loadAlerts, saveAlerts, type PriceAlert } from "./upgrade/alerts";
import { PriceContext, PriceSheet, type SheetPart } from "./upgrade/PriceSheet";
import { AlertsView } from "./upgrade/AlertsView";
import { SelectionView } from "./upgrade/SelectionView";
import { OptimizeView } from "./upgrade/OptimizeView";
import { AdviceNotice, ReportButton } from "./upgrade/PriceSheet";
import { ReportDialog } from "./ReportDialog";
import { UpdateBanner } from "./UpdateBanner";
import { pcSummary } from "./report";
import { SettingsView } from "./SettingsView";
import { applyTheme, loadSettings, saveSettings, setCurrentLang, SettingsContext, tr, type Settings } from "./settings";
import { SelectionContext, loadSelection, saveSelection, slotOf, type Selection } from "./upgrade/selection";

type View = "overview" | "goal" | "improve" | "upgrades" | "selection" | "alerts" | "optimize" | "settings";

const inApp = isTauri();

async function loadReport(): Promise<Report> {
  if (!inApp) return new Promise((res) => setTimeout(() => res(demoReport), 600));
  return invoke<Report>("scan");
}

async function loadMetrics(): Promise<Metrics> {
  return inApp ? invoke<Metrics>("metrics") : demoMetrics();
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const updateSettings = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    saveSettings(next);
    setCurrentLang(next.lang);
    setSettings(next);
  };
  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);
  useEffect(() => {
    setCurrentLang(settings.lang);
  }, [settings.lang]);
  const settingsCtx = { settings, update: updateSettings };

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
  const [selection, setSelection] = useState<Selection>(loadSelection);
  const updateSelection = (s: Selection) => {
    saveSelection(s);
    setSelection(s);
  };
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

  // Premier lancement : écran d'accueil avec un seul bouton « Lancer l'analyse », sans le menu.
  // Ensuite, l'analyse se lance d'elle-même à chaque ouverture.
  const [welcome, setWelcome] = useState<"intro" | "scanning" | "done">(() => {
    try {
      return localStorage.getItem(WELCOME_KEY) ? "done" : "intro";
    } catch {
      return "done";
    }
  });
  const startFirstScan = async () => {
    setWelcome("scanning");
    await scan();
    try {
      localStorage.setItem(WELCOME_KEY, "1");
    } catch {
      /* stockage indisponible : l'accueil reviendra au prochain lancement */
    }
    setWelcome("done");
  };

  useEffect(() => {
    if (welcome === "done") scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const recos = useMemo(() => (report ? recommend(report, live) : []), [report, live, settings.lang]);
  const profile = useMemo(() => (report ? buildProfile(report, answers) : undefined), [report, answers, settings.lang]);
  const verdict = useMemo(() => (report && profile ? assess(goal, profile, report) : undefined), [report, profile, goal, settings.lang]);
  // Plan d'évolution : toutes les combinaisons d'upgrades, recalculées quand l'objectif, le budget ou les prix changent.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const proposals = useMemo(() => (profile ? proposeAll(profile) : undefined), [profile, pricesVersion, settings.lang]);
  // 3 options vérifiées par catégorie, dans le budget, pour l'onglet Améliorations.
  const options = useMemo(() => {
    if (!profile || !proposals || !verdict) return undefined;
    const o: Record<string, OptionList> = {};
    for (const cat of ["gpu", "cpu", "ram", "storage"] as const) o[cat] = topOptions(goal, profile, verdict, proposals[cat] as never, cat);
    return o;
  }, [profile, proposals, verdict, goal, settings.lang]);
  const plan = useMemo(
    () => (report && profile && proposals && goal.configured ? optimize(goal, profile, report, proposals) : undefined),
    [report, profile, proposals, goal, settings.lang],
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

  if (welcome !== "done")
    return (
      <SettingsContext.Provider value={settingsCtx}>
        <Welcome scanning={welcome === "scanning"} onStart={startFirstScan} />
      </SettingsContext.Provider>
    );

  return (
    <SettingsContext.Provider value={settingsCtx}>
    <PriceContext.Provider value={{ open: setSheet, alerts, setAlerts }}>
    <SelectionContext.Provider
      value={{
        selection,
        add: (pr) => {
          const { slot, id } = slotOf(pr);
          updateSelection({ ...selection, [slot]: id });
        },
        remove: (slot) => {
          const next = { ...selection };
          delete next[slot];
          updateSelection(next);
        },
        replace: (choice) => {
          const next: Selection = {};
          for (const pr of Object.values(choice)) if (pr) next[slotOf(pr).slot] = slotOf(pr).id;
          updateSelection(next);
        },
        clear: () => updateSelection({}),
        open: () => go("selection"),
      }}
    >
    <div className="app">
      <aside className="side">
        <div className="brand">
          <div className="logo">
            <Icon name="up" />
          </div>
          <div>
            <div className="brand-name">PCEvolu</div>
            <div className="brand-sub">{tr("Analyse & upgrades", "Scan & upgrades")}</div>
          </div>
        </div>
        <nav>
          <div className="nav-group">{tr("1. Mon PC", "1. My PC")}</div>
          <NavItem icon="grid" label={tr("Mon PC", "My PC")} sub={tr("État et composants", "Health and components")} active={view === "overview" && !wizardOpen} onClick={() => go("overview")} />
          <div className="nav-group">{tr("2. L'améliorer", "2. Improve it")}</div>
          <NavItem icon="spark" label={tr("Réglages gratuits", "Free tweaks")} sub={tr("Sans rien acheter", "Without buying anything")} active={view === "improve" && !wizardOpen} onClick={() => go("improve")} count={freeCount} />
          <NavItem icon="target" label={tr("Mon plan", "My plan")} sub={tr("Quoi acheter, et pourquoi", "What to buy, and why")} active={view === "goal" || wizardOpen} onClick={() => go("goal")} />
          <NavItem icon="cart" label={tr("Toutes les pièces", "All parts")} sub={tr("Catalogue compatible", "Compatible catalogue")} active={view === "upgrades" && !wizardOpen} onClick={() => go("upgrades")} />
          <NavItem icon="check" label={tr("Ma sélection", "My selection")} sub={tr("Tes choix, vérifiés ensemble", "Your picks, checked together")} active={view === "selection" && !wizardOpen} onClick={() => go("selection")} count={Object.keys(selection).length} />
          <div className="nav-group">{tr("3. Suivre", "3. Track")}</div>
          <NavItem icon="bell" label={tr("Alertes prix", "Price alerts")} sub={tr("Le bon moment pour acheter", "The right time to buy")} active={view === "alerts" && !wizardOpen} onClick={() => go("alerts")} count={triggeredCount} />
          <div className="nav-group">{tr("Entretien", "Maintenance")}</div>
          <NavItem icon="speed" label={tr("Optimiser", "Optimize")} sub={tr("Démarrage, processus, réglages", "Startup, processes, settings")} active={view === "optimize" && !wizardOpen} onClick={() => go("optimize")} />
        </nav>
        <div className="side-scan">
          <button className="btn" onClick={scan} disabled={scanning}>
            <Icon name="refresh" className={scanning ? "spin" : ""} />
            {scanning ? tr("Analyse…", "Scanning…") : tr("Réanalyser", "Rescan")}
          </button>
          <div className="muted small">
            {scannedAt
              ? tr("Dernière analyse à ", "Last scan at ") + scannedAt.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" })
              : " "}
            {!inApp && <div className="demo-flag">{tr("Mode démo (navigateur)", "Demo mode (browser)")}</div>}
          </div>
        </div>
        <div className="side-foot">
          <NavItem icon="gear" label={tr("Paramètres", "Settings")} active={view === "settings" && !wizardOpen} onClick={() => go("settings")} />
          <ReportButton
            topic={tr(`page ${viewLabel()[view]}`, `${viewLabel()[view]} page`)}
            kind={view === "overview" ? "composant" : "autre"}
            details={[tr(`Page : ${viewLabel()[view]}`, `Page: ${viewLabel()[view]}`)]}
            label={tr("Signaler une erreur", "Report an error")}
          />
        </div>
      </aside>

      <main className="main">
        <UpdateBanner />
        {error && (
          <div className="error">
            <b>{tr("L'analyse a échoué.", "The scan failed.")}</b> {error}
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
            next={<NextStep hint={tr("Pas pressé ? PCEvolu peut te prévenir quand ces pièces baissent.", "No rush? PCEvolu can let you know when these parts drop in price.")} label={tr("Étape suivante : mes alertes prix", "Next step: my price alerts")} onClick={() => go("alerts")} />}
          />
        )}
        {report && !wizardOpen && view === "improve" && (
          <FreeView
            recos={recos}
            next={
              <NextStep
                hint={goal.configured ? tr("Ensuite, ce qu'il vaut la peine d'acheter pour ton objectif.", "Next, what's worth buying for your goal.") : tr("Ensuite, dis à PCEvolu ce que tu veux faire de ton PC : il te dira quoi acheter.", "Next, tell PCEvolu what you want to do with your PC: it will tell you what to buy.")}
                label={goal.configured ? tr("Étape suivante : mon plan", "Next step: my plan") : tr("Étape suivante : définir mon objectif", "Next step: set my goal")}
                onClick={() => go("goal")}
              />
            }
          />
        )}
        {report && !wizardOpen && view === "selection" && verdict && profile && proposals && (
          <SelectionView
            proposals={proposals}
            report={report}
            profile={profile}
            goal={goal}
            verdict={verdict}
            onBrowse={(tab) => openUpgrades(tab)}
            onPlan={() => go("goal")}
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
          <NextStep hint={tr("Une pièce te plaît mais tu préfères attendre ? Crée une alerte depuis son prix.", "Like a part but would rather wait? Create an alert from its price.")} label={tr("Étape suivante : mes alertes prix", "Next step: my price alerts")} onClick={() => go("alerts")} />
        )}
        {!wizardOpen && view === "alerts" && <AlertsView onPlan={() => go("goal")} />}
        {!wizardOpen && view === "optimize" && <OptimizeView gpuName={report?.gpus[0]?.name} />}
        {!wizardOpen && view === "settings" && <SettingsView />}
      </main>
    </div>
      {sheet && <PriceSheet part={sheet} onClose={() => setSheet(undefined)} />}
      <ReportDialog pc={pcSummary(report)} />
    </SelectionContext.Provider>
    </PriceContext.Provider>
    </SettingsContext.Provider>
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

const WELCOME_KEY = "pcevolu.welcomed.v1";

const viewLabel = (): Record<View, string> => ({
  overview: tr("Mon PC", "My PC"),
  improve: tr("Réglages gratuits", "Free tweaks"),
  goal: tr("Mon plan", "My plan"),
  upgrades: tr("Toutes les pièces", "All parts"),
  selection: tr("Ma sélection", "My selection"),
  alerts: tr("Alertes prix", "Price alerts"),
  optimize: tr("Optimiser", "Optimize"),
  settings: tr("Paramètres", "Settings"),
});

/** Accueil du premier lancement : ce que fait PCEvolu, et un seul bouton. */
function Welcome({ scanning, onStart }: { scanning: boolean; onStart: () => void }) {
  return (
    <div className="welcome">
      <div className="welcome-inner">
        <div className="logo welcome-logo">
          <Icon name="up" />
        </div>
        <h1>{tr("Bienvenue dans PCEvolu", "Welcome to PCEvolu")}</h1>
        <p className="welcome-lead">
          {tr(
            "PCEvolu regarde ce qu'il y a dans ton PC, te dit ce qu'il vaut pour ce que tu veux en faire, et ce qu'il vaut la peine de changer, au bon prix.",
            "PCEvolu looks at what's inside your PC, tells you what it's worth for what you want to do, and what's worth upgrading, at the right price.",
          )}
        </p>
        <ul className="welcome-steps">
          <li>
            <Icon name="grid" />
            <span>
              <b>{tr("L'analyse", "The scan")}</b>{" "}
              {tr("lit tes composants : processeur, carte graphique, mémoire, disques, écrans.", "reads your components: processor, graphics card, memory, drives, displays.")}
            </span>
          </li>
          <li>
            <Icon name="target" />
            <span>
              <b>{tr("Ton objectif", "Your goal")}</b>{" "}
              {tr(": jouer, créer, travailler. Trois questions, et PCEvolu te fait un plan.", ": gaming, creating, working. Three questions, and PCEvolu builds you a plan.")}
            </span>
          </li>
          <li>
            <Icon name="check" />
            <span>
              <b>{tr("Rien ne quitte ton PC", "Nothing leaves your PC")}</b>{" "}
              {tr(": l'analyse se fait sur place et ne modifie rien.", ": the scan runs locally and changes nothing.")}
            </span>
          </li>
        </ul>
        <button className={`welcome-orb ${scanning ? "busy" : ""}`} onClick={onStart} disabled={scanning} autoFocus>
          <span className="welcome-orb-ring" aria-hidden />
          <Icon name={scanning ? "refresh" : "speed"} className={scanning ? "spin" : ""} />
          <span className="welcome-orb-label">{scanning ? tr("Analyse…", "Scanning…") : tr("Lancer l'analyse", "Start the scan")}</span>
        </button>
        <p className="muted small welcome-hint">
          {scanning
            ? tr("Lecture du processeur, de la mémoire, des disques et des écrans.", "Reading the processor, memory, drives and displays.")
            : tr("Quelques secondes suffisent.", "It only takes a few seconds.")}
        </p>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="loading">
      <div className="pulse" />
      <div>{tr("Analyse de ton PC en cours…", "Scanning your PC…")}</div>
      <div className="muted small">{tr("Lecture du processeur, de la mémoire, des disques et des écrans", "Reading the processor, memory, drives and displays")}</div>
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
          <h1>{clean(r.board.product) || r.system.model || tr("Mon PC", "My PC")}</h1>
          <p className="gp-goal">
            {tr(`${r.os.name} (build ${r.os.build}), allumé depuis ${uptime(live?.uptimeSecs)}.`, `${r.os.name} (build ${r.os.build}), on for ${uptime(live?.uptimeSecs)}.`)}
          </p>
        </div>
        <div className={`ov-score s-${score.level}`} title={tr("Note calculée à partir des améliorations restantes", "Score based on the improvements left to make")}>
          <span className="num">{score.value}</span>
          <span>{score.label}</span>
        </div>
      </header>

      {verdict ? (
        <section className="answer ov-answer">
          <h2 className="answer-title">{verdict.title}</h2>
          <p className="ov-answer-sub">{verdict.summary}</p>
          <button className="btn primary" onClick={() => go("goal")}>
            {tr("Voir mon plan", "See my plan")}
          </button>
        </section>
      ) : (
        <section className="answer ov-answer">
          <h2 className="answer-title">{tr("Dis-nous ce que tu veux faire de ton PC", "Tell us what you want to do with your PC")}</h2>
          <p className="ov-answer-sub">{tr("Jeu, bureautique, création, et ton budget : PCEvolu te dit si ton PC suffit et quoi améliorer en priorité.", "Gaming, office work, creating, and your budget: PCEvolu tells you if your PC is enough and what to improve first.")}</p>
          <button className="btn primary" onClick={onSetGoal}>
            {tr("Définir mon objectif", "Set my goal")}
          </button>
        </section>
      )}

      <section className="kpis">
        <Kpi label={tr("Processeur", "Processor")} value={live?.cpuPercent} unit="%" sub={clean(cpu?.name)} />
        <Kpi label={tr("Mémoire", "Memory")} value={ramPct} unit="%" sub={tr(`${gb(live?.ramUsedBytes, 1)} sur ${gb(r.memory.totalBytes)}`, `${gb(live?.ramUsedBytes, 1)} of ${gb(r.memory.totalBytes)}`)} warnAt={85} />
        <Kpi label={tr("Carte graphique", "Graphics card")} value={live?.gpu?.usagePercent} unit="%" sub={live?.gpu?.tempC != null ? `${clean(gpu?.name)}, ${Math.round(live.gpu.tempC)} °C` : clean(gpu?.name)} accent="var(--nv)" />
        <Kpi label={tr(`Disque ${sys?.letter ?? ""}`, `Drive ${sys?.letter ?? ""}`)} value={diskPct} unit="%" sub={tr(`${gb(sys?.freeBytes)} libres`, `${gb(sys?.freeBytes)} free`)} warnAt={85} />
      </section>

      <div className="ov-split">
        <section>
          <h2 className="imp-h">{tr("À faire en priorité", "Top priorities")}</h2>
          {recos.length === 0 ? (
            <p className="muted">{tr("Rien à signaler : ton PC est bien configuré.", "Nothing to report: your PC is well set up.")}</p>
          ) : (
            <>
              <ul className="imp-list">
                {recos.slice(0, 3).map((x) => (
                  <RecoLine key={x.id} r={x} />
                ))}
              </ul>
              <button className="link" onClick={() => go("improve")}>
                {recos.length > 3 ? tr(`Voir les ${recos.length} améliorations`, `See all ${recos.length} improvements`) : tr("Voir le détail et ce qu'il faut acheter", "See the details and what to buy")}
              </button>
            </>
          )}
        </section>
        <section>
          <h2 className="imp-h">{tr("Ton PC", "Your PC")}</h2>
          <ul className="facts">
            <Fact icon="chip" k={tr("Processeur", "Processor")} v={tr(`${clean(cpu?.name)}, ${cpu?.cores ?? "?"} cœurs`, `${clean(cpu?.name)}, ${cpu?.cores ?? "?"} cores`)} />
            <Fact icon="gpu" k={tr("Carte graphique", "Graphics card")} v={`${clean(gpu?.name)}, ${gb(gpu?.vramBytes)}`} />
            <Fact icon="ram" k={tr("Mémoire", "Memory")} v={tr(`${gb(r.memory.totalBytes)} ${r.memory.modules[0]?.kind ?? ""}, ${r.memory.modules.length} barrette${r.memory.modules.length > 1 ? "s" : ""} sur ${r.memory.slotsTotal ?? "?"}`, `${gb(r.memory.totalBytes)} ${r.memory.modules[0]?.kind ?? ""}, ${r.memory.modules.length} stick${r.memory.modules.length > 1 ? "s" : ""} in ${r.memory.slotsTotal ?? "?"} slots`)} />
            <Fact icon="disk" k={tr("Stockage", "Storage")} v={r.disks.map((d) => `${diskSize(d.sizeBytes)} ${d.media}`).join(" + ") || "—"} />
            <Fact icon="screen" k={tr("Écran", "Display")} v={r.displays.map((d) => tr(`${d.width}×${d.height} à ${d.currentHz} Hz`, `${d.width}×${d.height} at ${d.currentHz} Hz`)).join(", ") || "—"} />
            <Fact icon="board" k={tr("Carte mère", "Motherboard")} v={clean(r.board.product)} />
          </ul>
          <button className="link" onClick={() => document.getElementById("fiche-technique")?.scrollIntoView({ behavior: "smooth" })}>
            {tr("Voir la fiche technique complète", "See the full spec sheet")}
          </button>
        </section>
      </div>

      <section className="ov-tech" id="fiche-technique">
        <h2 className="imp-h">{tr("Fiche technique", "Spec sheet")}</h2>
        <Components report={r} live={live} />
      </section>

      {verdict ? (
        <NextStep
          hint={freeCount ? tr(`Commence par les ${freeCount} réglage${freeCount > 1 ? "s" : ""} gratuit${freeCount > 1 ? "s" : ""}, puis regarde ce qu'il vaut la peine d'acheter.`, `Start with the ${freeCount} free tweak${freeCount > 1 ? "s" : ""}, then look at what's worth buying.`) : undefined}
          label={freeCount ? tr("Étape suivante : réglages gratuits", "Next step: free tweaks") : tr("Étape suivante : mon plan", "Next step: my plan")}
          onClick={() => go(freeCount ? "improve" : "goal")}
        />
      ) : (
        <NextStep label={tr("Étape suivante : définir mon objectif", "Next step: set my goal")} onClick={onSetGoal} />
      )}
    </div>
  );
}

function healthScore(recos: Recommendation[]) {
  const penalty = recos.reduce((s, r) => s + (r.level === "high" ? 18 : r.level === "medium" ? 9 : 3), 0);
  const value = Math.max(0, 100 - penalty);
  if (value >= 85) return { value, label: tr("Excellent", "Excellent"), level: "ok" };
  if (value >= 65) return { value, label: tr("Bon, à optimiser", "Good, could be better"), level: "warn" };
  return { value, label: tr("À améliorer", "Needs work"), level: "bad" };
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
const UPGRADE_TAB: Record<string, string> = {
  "Mémoire vive": "ram", Stockage: "storage", "Carte graphique": "gpu", Processeur: "cpu",
  "Memory (RAM)": "ram", Storage: "storage", "Graphics card": "gpu", Processor: "cpu",
};

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
          <h1>{tr("Réglages gratuits", "Free tweaks")}</h1>
          <p className="gp-goal">{tr("Ce que tu peux améliorer tout de suite, sans rien acheter.", "What you can improve right now, without buying anything.")}</p>
        </div>
      </header>
      {free.length === 0 ? (
        <p className="muted">{tr("Rien à régler : ton PC est déjà bien configuré.", "Nothing to tweak: your PC is already well set up.")}</p>
      ) : (
        <ul className="imp-list">
          {free.map((r) => (
            <RecoLine key={r.id} r={r} detail />
          ))}
        </ul>
      )}
      {free.length > 0 && <AdviceNotice />}
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
      buys.push({ id: n.id, tab: n.fix, kind, title: tr(`${n.current}, il faudrait ${n.target.charAt(0).toLowerCase()}${n.target.slice(1)}`, `${n.current}, you'd need ${n.target.charAt(0).toLowerCase()}${n.target.slice(1)}`), why: n.detail, goal: true });
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
  if (buys.length === 0) return <p className="muted">{tr("Aucune pièce ne limite ton PC pour cet objectif.", "No part is holding your PC back for this goal.")}</p>;

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
                  {b.goal && <span className="part-flag">{tr("Bloque ton objectif", "Blocks your goal")}</span>}
                </div>
                <div className="part-title">{catalogText(b.title)}</div>
                <p className="part-why">
                  <T>{b.why}</T>
                </p>
              </div>
              {b.price && (
                <span className="part-price">
                  <span className="muted">{tr("Budget", "Budget")}</span>
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
                          {o.impact.reachesGoal ? tr("Atteint ton objectif", "Reaches your goal") : o.impact.label}
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
                  {tr("Aucune pièce seule ne suffit dans ton budget : le plan conseillé, en haut de la page, en combine plusieurs.", "No single part is enough within your budget: the recommended plan, at the top of the page, combines several.")}
                </p>
              )
            )}

            <footer className="part-foot">
              <button className="link" onClick={() => openTab(b.tab)}>
                {tr("Voir toutes les options compatibles", "See all compatible options")}
              </button>
            </footer>
          </section>
        );
      })}
    </div>
  );
}

const TAB_ICON: Record<string, IconName> = { gpu: "gpu", cpu: "chip", ram: "ram", storage: "disk" };

const price = (a?: number, b?: number) => (a == null ? "—" : a === b || b == null ? `${a} €` : tr(`${a} à ${b} €`, `${a} to ${b} €`));

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
        {r.system.isLaptop ? tr("PC portable", "Laptop") : tr("PC fixe", "Desktop PC")}
        {r.system.manufacturer && !/to be filled|default/i.test(r.system.manufacturer) ? ` ${r.system.manufacturer.replace(/,? (Co\.,? )?(Ltd|Inc|Corp)\.?$/i, "")}` : ""}{tr(", tel que Windows le voit.", ", as Windows sees it.")}
      </p>

      <div className="grid">
        {r.cpus.map((c, i) => (
          <Card key={i} icon="chip" cat={tr("Processeur", "Processor")} name={clean(c.name)}>
            <Row k={tr("Cœurs / threads", "Cores / threads")} v={`${c.cores ?? "?"} / ${c.threads ?? "?"}`} />
            <Row k={tr("Fréquence de base", "Base clock")} v={ghz(c.baseMhz)} />
            <Row k={tr("Cache L2 / L3", "L2 / L3 cache")} v={`${kb(c.l2Kb)} / ${kb(c.l3Kb)}`} />
            <Row k={tr("Charge actuelle", "Current load")} v={live?.cpuPercent != null ? tr(`${Math.round(live.cpuPercent)} %`, `${Math.round(live.cpuPercent)}%`) : "—"} />
            <Row k={tr("Virtualisation", "Virtualization")} v={c.virtualization == null ? "—" : c.virtualization ? tr("Activée", "On") : tr("Désactivée", "Off")} badge={c.virtualization ? "ok" : undefined} />
          </Card>
        ))}

        {r.gpus.map((g, i) => (
          <Card key={i} icon="gpu" cat={tr("Carte graphique", "Graphics card")} name={clean(g.name)} accent="var(--nv)">
            <Row k={tr("Mémoire vidéo", "Video memory")} v={gb(g.vramBytes)} />
            {i === 0 && live?.gpu && (
              <>
                <Row k={tr("Température", "Temperature")} v={live.gpu.tempC != null ? `${Math.round(live.gpu.tempC)} °C` : "—"} badge={live.gpu.tempC != null ? (live.gpu.tempC > 83 ? "bad" : "ok") : undefined} />
                <Row k={tr("Utilisation", "Usage")} v={live.gpu.usagePercent != null ? tr(`${Math.round(live.gpu.usagePercent)} %`, `${Math.round(live.gpu.usagePercent)}%`) : "—"} />
                <Row k={tr("Consommation", "Power draw")} v={live.gpu.powerW != null ? `${live.gpu.powerW.toFixed(1)} W` : "—"} />
              </>
            )}
            <Row k={tr("Pilote", "Driver")} v={g.driverVersion} />
            <Row k={tr("Date du pilote", "Driver date")} v={date(g.driverDate)} />
          </Card>
        ))}

        <Card icon="ram" cat={tr("Mémoire vive", "Memory (RAM)")} name={`${gb(r.memory.totalBytes)} ${mods[0]?.kind ?? ""} ${mods[0]?.manufacturer ?? ""}`}>
          <Row k={tr("Vitesse", "Speed")} v={mods[0]?.configuredMts ? `${mods[0].configuredMts} MT/s` : "—"} />
          <Row k={tr("Mode", "Mode")} v={mods.length >= 2 ? "Dual channel" : "Single channel"} badge={mods.length >= 2 ? "ok" : "warn"} />
          <Row k={tr("Maximum supporté", "Max supported")} v={gb(r.memory.maxCapacityBytes)} />
          {mods[0]?.partNumber && <Row k={tr("Référence", "Part number")} v={mods[0].partNumber} />}
          <div className="slots">
            {Array.from({ length: slots }, (_, i) => {
              const m = mods[i];
              return (
                <div key={i} className={`slot ${m ? "on" : ""}`} title={m?.slot}>
                  {m ? gb(m.capacityBytes) : tr("Libre", "Empty")}
                </div>
              );
            })}
          </div>
        </Card>

        <Card icon="board" cat={tr("Carte mère", "Motherboard")} name={clean(r.board.product)} brand={r.board.manufacturer}>
          <Row k={tr("Fabricant", "Manufacturer")} v={r.board.manufacturer?.replace(" Co., Ltd.", "")} logo />
          <Row k={tr("Révision", "Revision")} v={r.board.version} />
          <Row k="BIOS" v={tr(`${r.board.biosVersion ?? "?"}, du ${date(r.board.biosDate)}`, `${r.board.biosVersion ?? "?"}, from ${date(r.board.biosDate)}`)} />
          <Row k={tr("Éditeur du BIOS", "BIOS vendor")} v={r.board.biosVendor} />
        </Card>

        {r.disks.map((d, i) => (
          <Card key={i} icon="disk" cat={tr("Stockage", "Storage")} name={d.name ?? tr("Disque", "Drive")}>
            <Row k={tr("Type", "Type")} v={`${d.media} ${d.bus}`} />
            <Row k={tr("Capacité", "Capacity")} v={diskSize(d.sizeBytes)} />
            <Row k={tr("État", "Health")} v={health(d.health)} badge={d.health === "healthy" ? "ok" : d.health === "unknown" ? undefined : "bad"} />
          </Card>
        ))}

        <Card icon="folder" cat={tr("Volumes", "Volumes")} noBrand name={tr(`${r.volumes.length} lecteur${r.volumes.length > 1 ? "s" : ""}`, `${r.volumes.length} drive${r.volumes.length > 1 ? "s" : ""}`)}>
          {r.volumes.map((v) => {
            const pct = v.sizeBytes && v.freeBytes != null ? ((v.sizeBytes - v.freeBytes) / v.sizeBytes) * 100 : 0;
            return (
              <div key={v.letter} className="vol">
                <div className="vol-head">
                  <span>
                    <b>{v.letter}</b> {v.label}
                  </span>
                  <span className="mono">
                    {tr(`${gb(v.freeBytes)} libres / ${gb(v.sizeBytes)}`, `${gb(v.freeBytes)} free / ${gb(v.sizeBytes)}`)}
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
            <Card key={d.device} icon="screen" cat={tr("Écran", "Display")} name={m ? `${m.maker ?? ""} ${m.model ?? ""}`.trim() : d.adapter} brand={m?.maker ?? ""}>
              <Row k={tr("Résolution", "Resolution")} v={`${d.width} × ${d.height}`} />
              <Row k={tr("Fréquence actuelle", "Current refresh rate")} v={`${d.currentHz} Hz`} badge={d.maxHz - d.currentHz >= 10 ? "bad" : "ok"} />
              <Row k={tr("Fréquence max", "Max refresh rate")} v={`${d.maxHz} Hz`} />
              {m?.year && <Row k={tr("Fabrication", "Made in")} v={String(m.year)} />}
              <Row k={tr("Branché sur", "Plugged into")} v={clean(d.adapter)} logo />
            </Card>
          );
        })}

        <Card icon="wifi" cat={tr("Réseau", "Network")} name={clean(r.network.find((n) => n.connected)?.description) || tr("Cartes réseau", "Network adapters")}>
          {r.network.length === 0 && <Row k={tr("Cartes physiques", "Physical adapters")} v={tr("Aucune détectée", "None detected")} />}
          {r.network.map((n) => (
            <Row key={n.name} k={`${n.wireless ? "Wi-Fi" : "Ethernet"} (${n.name ?? ""})`} v={n.connected ? speed(n.speedBps) : tr("Déconnecté", "Disconnected")} badge={n.connected ? "ok" : undefined} />
          ))}
        </Card>

        <Card icon="audio" cat={tr("Audio", "Audio")} name={r.audio[0]?.name ?? tr("Périphériques audio", "Audio devices")}>
          {r.audio.map((a, i) => (
            <Row key={i} k={a.name ?? "?"} v={a.manufacturer} logo />
          ))}
        </Card>
      </div>
    </>
  );
}

const kb = (v?: number) =>
  v == null ? "—" : v >= 1024 ? `${(v / 1024).toLocaleString(locale())} ${tr("Mo", "MB")}` : `${v} ${tr("Ko", "KB")}`;
const health = (h: string) =>
  ({
    healthy: tr("Sain", "Healthy"),
    warning: tr("Avertissement", "Warning"),
    unhealthy: tr("Défaillant", "Failing"),
    unknown: tr("Inconnu", "Unknown"),
  })[h] ?? h;

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
  const label = { ok: "OK", warn: tr("À améliorer", "Could be better"), bad: tr("À corriger", "Needs fixing") };
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
