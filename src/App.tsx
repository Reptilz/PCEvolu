import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Metrics, Report } from "./types";
import { recommend, type Recommendation } from "./recommendations";
import { demoMetrics, demoReport } from "./demo";
import { clean, date, diskSize, gb, ghz, speed, uptime } from "./format";
import { Icon, type IconName } from "./icons";
import { UpgradesView } from "./upgrade/UpgradesView";
import { buildProfile, loadAnswers, type Answers } from "./upgrade/profile";
import { assess, loadGoal, saveGoal, type Goal, type Verdict } from "./upgrade/goal";
import { GoalDiagnostic, GoalWizard, VerdictBanner } from "./upgrade/GoalViews";
import { loadPrices } from "./upgrade/prices";
import { loadCatalog } from "./upgrade/catalog-remote";

type View = "overview" | "goal" | "improve" | "upgrades" | "components";

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

  useEffect(() => {
    // Catalogue d'abord (il peut ajouter des composants), puis les prix du marché.
    loadCatalog()
      .then(() => loadPrices())
      .then(() => setPricesVersion((v) => v + 1));
  }, []);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const verdict = useMemo(() => (report ? assess(goal, buildProfile(report, answers), report) : undefined), [report, answers, goal, pricesVersion]);

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

  return (
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
          <NavItem
            icon="grid"
            label="Vue d'ensemble"
            active={view === "overview" && !wizardOpen}
            onClick={() => {
              setWizardOpen(false);
              setView("overview");
            }}
          />
          <NavItem
            icon="target"
            label="Mon objectif"
            active={view === "goal" || wizardOpen}
            onClick={() => (goal.configured ? (setWizardOpen(false), setView("goal")) : setWizardOpen(true))}
          />
          <NavItem icon="spark" label="Améliorations" active={view === "improve"} onClick={() => setView("improve")} count={recos.length} />
          <NavItem icon="cart" label="Upgrades" active={view === "upgrades"} onClick={() => setView("upgrades")} />
          <NavItem icon="chip" label="Composants" active={view === "components"} onClick={() => setView("components")} />
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
          <Overview report={report} live={live} recos={recos} go={setView} verdict={goal.configured ? verdict : undefined} onSetGoal={() => setWizardOpen(true)} />
        )}
        {report && !wizardOpen && view === "goal" && verdict && (
          <GoalDiagnostic goal={goal} verdict={verdict} onEdit={() => setWizardOpen(true)} onUpgrades={openUpgrades} />
        )}
        {report && !wizardOpen && view === "improve" && <Improve recos={recos} go={setView} />}
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
        {report && !wizardOpen && view === "components" && <Components report={report} live={live} />}
      </main>
    </div>
  );
}

function NavItem(p: { icon: IconName; label: string; active: boolean; onClick: () => void; count?: number }) {
  return (
    <button className={`nav ${p.active ? "on" : ""}`} onClick={p.onClick}>
      <Icon name={p.icon} />
      <span>{p.label}</span>
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

  return (
    <>
      <header className="page-head">
        <div>
          <h1>{clean(r.board.product) || r.system.model || "Mon PC"}</h1>
          <div className="muted">
            {r.os.name} · build {r.os.build} · allumé depuis {uptime(live?.uptimeSecs)}
          </div>
        </div>
        <div className={`score s-${score.level}`}>
          <div className="score-val">{score.value}</div>
          <div className="score-lbl">{score.label}</div>
        </div>
      </header>

      {verdict ? (
        <div className="overview-goal" onClick={() => go("goal")} role="button">
          <VerdictBanner verdict={verdict} compact />
        </div>
      ) : (
        <div className="verdict v-limited compact goal-cta">
          <Icon name="target" />
          <div className="verdict-text">
            <b>Dis-nous ce que tu veux faire de ton PC</b>
            <span>Jeu, bureautique, création… et ton budget : PCEvolu te dira si ton PC suffit et quoi améliorer en priorité.</span>
          </div>
          <button className="btn primary" onClick={onSetGoal}>
            Définir mon objectif
          </button>
        </div>
      )}

      <section className="kpis">
        <Kpi label="Processeur" value={live?.cpuPercent} unit="%" sub={clean(cpu?.name)} />
        <Kpi label="Mémoire" value={ramPct} unit="%" sub={`${gb(live?.ramUsedBytes, 1)} / ${gb(r.memory.totalBytes)}`} warnAt={85} />
        <Kpi label="Carte graphique" value={live?.gpu?.usagePercent} unit="%" sub={live?.gpu?.tempC != null ? `${Math.round(live.gpu.tempC)} °C · ${clean(gpu?.name)}` : clean(gpu?.name)} accent="var(--nv)" />
        <Kpi label={`Disque ${sys?.letter ?? ""}`} value={diskPct} unit="%" sub={`${gb(sys?.freeBytes)} libres`} warnAt={85} />
      </section>

      <section className="split">
        <div className="panel">
          <div className="panel-head">
            <h2>Priorités</h2>
            <button className="link" onClick={() => go("improve")}>
              Tout voir
            </button>
          </div>
          {recos.length === 0 ? (
            <div className="all-good">
              <Icon name="check" /> Rien à signaler : ton PC est bien configuré.
            </div>
          ) : (
            recos.slice(0, 3).map((x) => <RecoCard key={x.id} r={x} compact />)
          )}
        </div>
        <div className="panel">
          <h2>En bref</h2>
          <ul className="facts">
            <Fact icon="chip" k="Processeur" v={`${clean(cpu?.name)} · ${cpu?.cores ?? "?"}C/${cpu?.threads ?? "?"}T`} />
            <Fact icon="gpu" k="Carte graphique" v={`${clean(gpu?.name)} · ${gb(gpu?.vramBytes)}`} />
            <Fact icon="ram" k="Mémoire" v={`${gb(r.memory.totalBytes)} ${r.memory.modules[0]?.kind ?? ""} · ${r.memory.modules.length}/${r.memory.slotsTotal ?? "?"} emplacements`} />
            <Fact icon="disk" k="Stockage" v={r.disks.map((d) => `${diskSize(d.sizeBytes)} ${d.media} ${d.bus}`).join(" + ") || "—"} />
            <Fact icon="screen" k="Écran" v={r.displays.map((d) => `${d.width}×${d.height} à ${d.currentHz} Hz`).join(", ") || "—"} />
            <Fact icon="board" k="Carte mère" v={clean(r.board.product)} />
          </ul>
        </div>
      </section>
    </>
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
// Améliorations + liste d'upgrades
// ---------------------------------------------------------------------------

function Improve({ recos, go }: { recos: Recommendation[]; go: (v: View) => void }) {
  const upgrades = recos.filter((r) => r.upgrade);
  const min = upgrades.reduce((s, r) => s + (r.upgrade?.priceMin ?? 0), 0);
  const max = upgrades.reduce((s, r) => s + (r.upgrade?.priceMax ?? 0), 0);
  const free = recos.filter((r) => !r.upgrade);

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Améliorations</h1>
          <div className="muted">Classées de la plus utile à la moins urgente</div>
        </div>
      </header>

      {recos.length === 0 && (
        <div className="panel all-good">
          <Icon name="check" /> Rien à améliorer pour l'instant.
        </div>
      )}

      {free.length > 0 && (
        <section>
          <h2 className="section">Réglages et entretien · gratuits</h2>
          <div className="stack">
            {free.map((r) => (
              <RecoCard key={r.id} r={r} />
            ))}
          </div>
        </section>
      )}

      {upgrades.length > 0 && (
        <section>
          <h2 className="section">Liste d'upgrades</h2>
          <div className="panel">
            <table className="table">
              <thead>
                <tr>
                  <th>Composant</th>
                  <th>Suggestion</th>
                  <th>Pourquoi</th>
                  <th className="num">Prix indicatif</th>
                </tr>
              </thead>
              <tbody>
                {upgrades.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className={`pill p-${r.level}`}>{r.upgrade!.component}</span>
                    </td>
                    <td className="strong">{r.upgrade!.suggestion}</td>
                    <td className="muted">{r.title}</td>
                    <td className="num mono">{price(r.upgrade!.priceMin, r.upgrade!.priceMax)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>Budget total estimé</td>
                  <td className="num mono">{price(min, max)}</td>
                </tr>
              </tfoot>
            </table>
            <p className="muted small note">
              Prix observés en neuf, à titre indicatif.{" "}
              <button className="link" onClick={() => go("upgrades")}>
                Voir tous les upgrades compatibles avec ta config
              </button>
            </p>
          </div>
          <div className="stack" style={{ marginTop: 12 }}>
            {upgrades.map((r) => (
              <RecoCard key={r.id} r={r} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

const price = (a?: number, b?: number) => (a == null ? "—" : a === b || b == null ? `${a} €` : `${a} – ${b} €`);

function RecoCard({ r, compact }: { r: Recommendation; compact?: boolean }) {
  return (
    <div className={`reco r-${r.level} ${compact ? "compact" : ""}`}>
      <div className="reco-tag">{r.tag}</div>
      <div className="reco-title">{r.title}</div>
      {!compact && <p className="reco-detail">{r.detail}</p>}
    </div>
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
      <header className="page-head">
        <div>
          <h1>Composants</h1>
          <div className="muted">
            {r.system.manufacturer} · {r.system.isLaptop ? "PC portable" : "PC fixe"}
          </div>
        </div>
      </header>

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

        <Card icon="board" cat="Carte mère" name={clean(r.board.product)}>
          <Row k="Fabricant" v={r.board.manufacturer?.replace(" Co., Ltd.", "")} />
          <Row k="Révision" v={r.board.version} />
          <Row k="BIOS" v={`${r.board.biosVersion ?? "?"} · ${date(r.board.biosDate)}`} />
          <Row k="Éditeur du BIOS" v={r.board.biosVendor} />
        </Card>

        {r.disks.map((d, i) => (
          <Card key={i} icon="disk" cat="Stockage" name={d.name ?? "Disque"}>
            <Row k="Type" v={`${d.media} ${d.bus}`} />
            <Row k="Capacité" v={diskSize(d.sizeBytes)} />
            <Row k="État" v={health(d.health)} badge={d.health === "healthy" ? "ok" : d.health === "unknown" ? undefined : "bad"} />
          </Card>
        ))}

        <Card icon="folder" cat="Volumes" name={`${r.volumes.length} lecteur${r.volumes.length > 1 ? "s" : ""}`}>
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
            <Card key={d.device} icon="screen" cat="Écran" name={m ? `${m.maker ?? ""} ${m.model ?? ""}`.trim() : d.adapter}>
              <Row k="Résolution" v={`${d.width} × ${d.height}`} />
              <Row k="Fréquence actuelle" v={`${d.currentHz} Hz`} badge={d.maxHz - d.currentHz >= 10 ? "bad" : "ok"} />
              <Row k="Fréquence max" v={`${d.maxHz} Hz`} />
              {m?.year && <Row k="Fabrication" v={String(m.year)} />}
              <Row k="Branché sur" v={clean(d.adapter)} />
            </Card>
          );
        })}

        <Card icon="wifi" cat="Réseau" name={clean(r.network.find((n) => n.connected)?.description) || "Cartes réseau"}>
          {r.network.length === 0 && <Row k="Cartes physiques" v="Aucune détectée" />}
          {r.network.map((n) => (
            <Row key={n.name} k={`${n.wireless ? "Wi-Fi" : "Ethernet"} · ${n.name ?? ""}`} v={n.connected ? speed(n.speedBps) : "Déconnecté"} badge={n.connected ? "ok" : undefined} />
          ))}
        </Card>

        <Card icon="audio" cat="Audio" name={r.audio[0]?.name ?? "Périphériques audio"}>
          {r.audio.map((a, i) => (
            <Row key={i} k={a.name ?? "?"} v={a.manufacturer} />
          ))}
        </Card>
      </div>
    </>
  );
}

const kb = (v?: number) => (v == null ? "—" : v >= 1024 ? `${(v / 1024).toLocaleString("fr-FR")} Mo` : `${v} Ko`);
const health = (h: string) => ({ healthy: "Sain", warning: "Avertissement", unhealthy: "Défaillant", unknown: "Inconnu" })[h] ?? h;

function Card(p: { icon: IconName; cat: string; name?: string; accent?: string; children: ReactNode }) {
  return (
    <div className="card">
      <div className="card-top">
        <div className="ico" style={p.accent ? { color: p.accent } : undefined}>
          <Icon name={p.icon} />
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

function Row({ k, v, badge }: { k: string; v?: string; badge?: "ok" | "warn" | "bad" }) {
  const label = { ok: "OK", warn: "À améliorer", bad: "À corriger" };
  return (
    <>
      <dt>{k}</dt>
      <dd>
        {v || "—"}
        {badge && <span className={`badge b-${badge}`}>{label[badge]}</span>}
      </dd>
    </>
  );
}
