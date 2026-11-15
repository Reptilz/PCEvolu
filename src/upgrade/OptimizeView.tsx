// Page « Optimiser » : programmes au démarrage, processus en cours et réglages Windows utiles au jeu.

import { useEffect, useMemo, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { BrandLogo, Icon } from "../icons";

interface StartupItem {
  name: string;
  command: string;
  location: "user-run" | "machine-run" | "machine-run32" | "user-folder" | "common-folder";
  enabled: boolean;
  userScope: boolean;
}
interface ProcessGroup {
  name: string;
  count: number;
  cpuPercent: number;
  memoryBytes: number;
  exe?: string;
  /** Élément de Windows ou de PCEvolu : pas de bouton « Fermer ». */
  protected?: boolean;
}
interface Tweaks {
  powerPlanGuid?: string;
  powerPlanName?: string;
  gameMode?: boolean;
  hags?: boolean | null;
  tempBytes?: number;
}
interface OptimizeReport {
  startup: StartupItem[];
  processes: ProcessGroup[];
  tweaks: Tweaks;
  ramTotalBytes: number;
  ramUsedBytes: number;
}

// ---------------------------------------------------------------------------
// Ce que l'on sait des programmes courants
// ---------------------------------------------------------------------------

type Verdict = "safe" | "keep" | "depends" | "unknown";
interface Known {
  match: RegExp;
  label: string;
  verdict: Verdict;
  why: string;
}

/** Programmes au démarrage connus : désactivables sans risque, à garder, ou selon l'usage. Le premier qui correspond l'emporte. */
const KNOWN: Known[] = [
  { match: /securityhealth|windowsdefender|msmpeng/i, label: "Sécurité Windows", verdict: "keep", why: "L'icône de Sécurité Windows (antivirus) : à garder." },
  { match: /avast|avg|norton|kaspersky|bitdefender|eset|mcafee|malwarebytes|sophos|panda|avira/i, label: "Antivirus", verdict: "keep", why: "Ton antivirus doit démarrer avec Windows pour te protéger." },
  { match: /vgtray|vanguard/i, label: "Riot Vanguard", verdict: "depends", why: "Anti-triche de Valorant et League of Legends : à garder seulement si tu joues à ces jeux (ils le relancent au besoin)." },
  { match: /rtkaud|rthdvcpl|realtek|waves ?maxx|nahimic|dolby/i, label: "Pilote audio", verdict: "keep", why: "Fait partie du pilote son (effets, prise casque) : à garder." },
  { match: /synaptics|elan|touchpad|wacom|precision/i, label: "Pilote de pavé tactile / tablette", verdict: "keep", why: "Gère le pavé tactile ou la tablette graphique : à garder." },
  { match: /igfx|intel.*graphics|hotkeycmds|persistence/i, label: "Pilote graphique Intel", verdict: "keep", why: "Fait partie du pilote graphique : à garder." },
  { match: /nvcontainer|nvbackend|nvidia/i, label: "NVIDIA", verdict: "depends", why: "Services NVIDIA (overlay, mises à jour du pilote) : désactivable si tu n'utilises pas l'overlay ni l'enregistrement." },
  { match: /radeon|amd ?software|cncmd|amdrsserv/i, label: "AMD Software", verdict: "depends", why: "Logiciel AMD (overlay, réglages) : désactivable, le pilote fonctionne sans." },
  { match: /lghub|logitech/i, label: "Logitech G HUB", verdict: "depends", why: "Garde-le si tu utilises des profils de souris, clavier ou éclairage ; sinon désactivable." },
  { match: /icue|corsair/i, label: "Corsair iCUE", verdict: "depends", why: "Garde-le si tu utilises l'éclairage ou les macros Corsair ; sinon désactivable." },
  { match: /razer|synapse/i, label: "Razer Synapse", verdict: "depends", why: "Garde-le si tu utilises des profils Razer ; sinon désactivable." },
  { match: /steam/i, label: "Steam", verdict: "safe", why: "Se lance quand tu ouvres un jeu : inutile au démarrage." },
  { match: /epicgames|epic games/i, label: "Epic Games Launcher", verdict: "safe", why: "Se lance quand tu ouvres un jeu : inutile au démarrage." },
  { match: /eadm|ea ?desktop|ealauncher|origin/i, label: "EA app", verdict: "safe", why: "Se lance quand tu ouvres un jeu EA : inutile au démarrage." },
  { match: /ubisoft|uplay/i, label: "Ubisoft Connect", verdict: "safe", why: "Se lance quand tu ouvres un jeu Ubisoft : inutile au démarrage." },
  { match: /battle\.?net|blizzard/i, label: "Battle.net", verdict: "safe", why: "Se lance quand tu ouvres un jeu Blizzard : inutile au démarrage." },
  { match: /riotclient/i, label: "Riot Client", verdict: "safe", why: "Se lance quand tu ouvres un jeu Riot : inutile au démarrage." },
  { match: /gog ?galaxy/i, label: "GOG Galaxy", verdict: "safe", why: "Inutile au démarrage." },
  { match: /discord/i, label: "Discord", verdict: "safe", why: "Tu peux l'ouvrir quand tu en as besoin : il démarre en quelques secondes." },
  { match: /spotify/i, label: "Spotify", verdict: "safe", why: "Inutile au démarrage." },
  { match: /teams|skype|zoom|slack|webex/i, label: "Messagerie / visio", verdict: "safe", why: "Tu peux l'ouvrir quand tu en as besoin." },
  { match: /edgeautolaunch|msedge/i, label: "Microsoft Edge (préchargement)", verdict: "safe", why: "Précharge Edge en arrière-plan : inutile si ce n'est pas ton navigateur principal." },
  { match: /chromeautolaunch|chrome\.exe/i, label: "Google Chrome (préchargement)", verdict: "safe", why: "Précharge Chrome en arrière-plan : il démarre très bien sans." },
  { match: /opera|brave|vivaldi|firefox/i, label: "Navigateur", verdict: "safe", why: "Inutile au démarrage." },
  { match: /onedrive/i, label: "OneDrive", verdict: "depends", why: "À garder si tu synchronises tes fichiers (Bureau, Documents) avec OneDrive ; sinon désactivable." },
  { match: /dropbox|googledrive|google drive|icloud|mega/i, label: "Synchronisation de fichiers", verdict: "depends", why: "À garder si tu synchronises des fichiers en permanence ; sinon désactivable." },
  { match: /ituneshelper|itunes/i, label: "iTunes Helper", verdict: "safe", why: "Ne sert qu'à brancher un iPhone / iPod : désactivable." },
  { match: /jusched|java ?update/i, label: "Mise à jour Java", verdict: "safe", why: "Vérifie les mises à jour de Java : désactivable." },
  { match: /adobe|acrobat|creative ?cloud|ccxprocess|adobegc/i, label: "Adobe", verdict: "safe", why: "Mises à jour et services Adobe : désactivables." },
  { match: /ccleaner|utorrent|bittorrent|qbittorrent/i, label: "Utilitaire", verdict: "safe", why: "Inutile au démarrage." },
  { match: /openvpn|nordvpn|protonvpn|surfshark|expressvpn/i, label: "VPN", verdict: "depends", why: "À garder si tu veux le VPN dès l'allumage ; sinon désactivable." },
  { match: /displaytune|g-menu|portrait displays/i, label: "Utilitaire d'écran", verdict: "safe", why: "Logiciel de réglage de l'écran : désactivable, l'écran fonctionne sans." },
  { match: /cortana|xbox|gamebar/i, label: "Application Windows", verdict: "safe", why: "Inutile au démarrage." },
];

const VERDICT_TEXT: Record<Verdict, string> = {
  safe: "Désactivable sans risque",
  depends: "Selon ton usage",
  keep: "À garder",
  unknown: "Inconnu",
};

function identify(item: StartupItem): Known | undefined {
  return KNOWN.find((k) => k.match.test(item.name) || k.match.test(item.command));
}

/** Nom lisible : « MicrosoftEdgeAutoLaunch_FC40… » → « Microsoft Edge (préchargement) ». */
const GENERIC_LABELS = new Set(["Antivirus", "Pilote audio", "Navigateur", "Utilitaire", "Messagerie / visio", "Synchronisation de fichiers", "Application Windows", "VPN", "Utilitaire d'écran", "Pilote de pavé tactile / tablette"]);
const displayName = (item: StartupItem, k?: Known) => (k && !GENERIC_LABELS.has(k.label) ? k.label : item.name.replace(/\.lnk$/i, "").replace(/_[0-9A-F]{16,}$/i, ""));

/** Processus courants : ce qu'ils sont, pour ne pas fermer n'importe quoi. */
const PROCESS_HINT: [RegExp, string][] = [
  [/^(chrome|msedge|firefox|opera|brave)$/i, "Navigateur : chaque onglet et extension est un processus séparé."],
  [/^msedgewebview2$/i, "Composant Windows utilisé par certaines applications pour afficher leur interface."],
  [/^svchost$/i, "Services de Windows : à laisser."],
  [/^(explorer|dwm|csrss|winlogon|lsass|services|smss|wininit|system|registry|memory compression)$/i, "Fait partie de Windows : à laisser."],
  [/^(msmpeng|securityhealthservice|nissrv)$/i, "Antivirus Windows Defender : à laisser."],
  [/^discord$/i, "Discord : ferme-le si tu ne l'utilises pas pendant tes parties."],
  [/^(steam|steamwebhelper|epicgameslauncher|eadesktop|riotclientservices)$/i, "Lanceur de jeux : peut être fermé hors des parties."],
  [/nvidia|nvcontainer/i, "Services NVIDIA (overlay, enregistrement)."],
  [/^(searchhost|searchindexer)$/i, "Recherche Windows : à laisser."],
];
const hint = (name: string) => PROCESS_HINT.find(([re]) => re.test(name))?.[1];

/** Plans d'alimentation par défaut de Windows. */
const POWER: Record<string, { name: string; ok: boolean; note: string }> = {
  "381b4222-f694-41f0-9685-ff5bb260df2e": { name: "Équilibré", ok: true, note: "Le bon choix pour la plupart des PC : le processeur monte en fréquence dès qu'il en a besoin." },
  "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c": { name: "Performances élevées", ok: true, note: "Le processeur reste à pleine vitesse : un peu plus réactif, consomme davantage." },
  "e9a42b02-d5df-448d-aa00-03f14749eb61": { name: "Performances optimales", ok: true, note: "Le plus réactif, consomme davantage au repos." },
  "a1841308-3541-4fab-bc81-f71556f20b4a": { name: "Économie d'énergie", ok: false, note: "Bride le processeur : à éviter sur un PC de jeu fixe." },
};

const gb = (b: number) => `${(b / 1024 ** 3).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Go`;
const mb = (b: number) => (b >= 1024 ** 3 ? gb(b) : `${Math.round(b / 1024 ** 2).toLocaleString("fr-FR")} Mo`);

// Données d'exemple pour l'aperçu dans un navigateur (hors application).
const DEMO: OptimizeReport = {
  startup: [
    { name: "Discord", command: "C:\\Users\\…\\Discord\\Update.exe --processStart Discord.exe", location: "user-run", enabled: true, userScope: true },
    { name: "Steam", command: "C:\\Program Files (x86)\\Steam\\steam.exe -silent", location: "user-run", enabled: true, userScope: true },
    { name: "MicrosoftEdgeAutoLaunch_0000", command: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe --no-startup-window", location: "user-run", enabled: true, userScope: true },
    { name: "SecurityHealth", command: "%windir%\\system32\\SecurityHealthSystray.exe", location: "machine-run", enabled: true, userScope: false },
    { name: "RtkAudUService", command: "C:\\Windows\\System32\\DriverStore\\…\\RtkAudUService64.exe -background", location: "machine-run", enabled: true, userScope: false },
    { name: "EpicGamesLauncher", command: "C:\\Program Files (x86)\\Epic Games\\Launcher\\…\\EpicGamesLauncher.exe -silent", location: "user-run", enabled: false, userScope: true },
  ],
  processes: [
    { name: "chrome", count: 28, cpuPercent: 3.2, memoryBytes: 4.2 * 1024 ** 3 },
    { name: "Discord", count: 6, cpuPercent: 0.2, memoryBytes: 750 * 1024 ** 2 },
    { name: "msedgewebview2", count: 10, cpuPercent: 0.1, memoryBytes: 820 * 1024 ** 2, protected: true },
    { name: "explorer", count: 1, cpuPercent: 0.1, memoryBytes: 420 * 1024 ** 2, protected: true },
    { name: "svchost", count: 80, cpuPercent: 0.3, memoryBytes: 210 * 1024 ** 2, protected: true },
  ],
  tweaks: { powerPlanGuid: "381b4222-f694-41f0-9685-ff5bb260df2e", powerPlanName: "Équilibré", gameMode: true, hags: null, tempBytes: 2.4 * 1024 ** 3 },
  ramTotalBytes: 16 * 1024 ** 3,
  ramUsedBytes: 11.2 * 1024 ** 3,
};

export function OptimizeView({ gpuName }: { gpuName?: string }) {
  const [data, setData] = useState<OptimizeReport>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [toggleError, setToggleError] = useState<string>();
  const [sort, setSort] = useState<"memory" | "cpu">("memory");
  const [showAllProc, setShowAllProc] = useState(false);
  const [tab, setTab] = useState<"startup" | "running" | "tweaks">("startup");
  const [confirmKill, setConfirmKill] = useState<string>();
  const [killing, setKilling] = useState<string>();
  const [killMsg, setKillMsg] = useState<{ ok: boolean; text: string }>();
  const app = isTauri();

  const load = async () => {
    setLoading(true);
    setError(undefined);
    try {
      setData(app ? await invoke<OptimizeReport>("optimize_scan") : DEMO);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const open = (target: string) => {
    setToggleError(undefined);
    if (app) invoke("open_system", { target }).catch((e) => setToggleError(String(e)));
  };
  const toggle = async (item: StartupItem) => {
    setToggleError(undefined);
    if (!app) return;
    try {
      await invoke("set_startup_enabled", { name: item.name, location: item.location, enabled: !item.enabled });
      setData((d) => d && { ...d, startup: d.startup.map((s) => (s === item ? { ...s, enabled: !s.enabled } : s)) });
    } catch (e) {
      setToggleError(String(e));
    }
  };

  const endProcess = async (p: ProcessGroup) => {
    setConfirmKill(undefined);
    setKillMsg(undefined);
    if (!app) {
      setData((d) => d && { ...d, processes: d.processes.filter((x) => x.name !== p.name) });
      setKillMsg({ ok: true, text: `${p.name} fermé (aperçu : rien n'a été fermé pour de vrai).` });
      return;
    }
    setKilling(p.name);
    try {
      const n = await invoke<number>("end_process", { name: p.name });
      setKillMsg({ ok: true, text: `${p.name} fermé${n > 1 ? ` (${n} processus)` : ""}.` });
      setData((d) => d && { ...d, processes: d.processes.filter((x) => x.name !== p.name) });
      // Relecture complète un peu plus tard : mémoire libérée et éventuels processus relancés.
      setTimeout(() => {
        invoke<OptimizeReport>("optimize_scan").then(setData).catch(() => {});
      }, 1500);
    } catch (e) {
      setKillMsg({ ok: false, text: String(e) });
    } finally {
      setKilling(undefined);
    }
  };

  const startup = useMemo(
    () =>
      (data?.startup ?? [])
        .map((s) => ({ s, k: identify(s) }))
        .sort((a, b) => Number(b.s.enabled) - Number(a.s.enabled) || ["safe", "depends", "unknown", "keep"].indexOf(a.k?.verdict ?? "unknown") - ["safe", "depends", "unknown", "keep"].indexOf(b.k?.verdict ?? "unknown")),
    [data],
  );
  const enabled = startup.filter((x) => x.s.enabled);
  const removable = enabled.filter((x) => x.k?.verdict === "safe");

  const procs = useMemo(() => {
    const list = [...(data?.processes ?? [])];
    list.sort((a, b) => (sort === "cpu" ? b.cpuPercent - a.cpuPercent : b.memoryBytes - a.memoryBytes));
    return showAllProc ? list : list.slice(0, 12);
  }, [data, sort, showAllProc]);

  const t = data?.tweaks;
  const plan = t?.powerPlanGuid ? POWER[t.powerPlanGuid] : undefined;
  const planName = plan?.name ?? t?.powerPlanName ?? "inconnu";
  const planOk = plan ? plan.ok : !/économie|saver/i.test(t?.powerPlanName ?? "");
  const ramPct = data ? Math.round((data.ramUsedBytes / data.ramTotalBytes) * 100) : 0;
  const recentGpu = /rtx|rx ?[6-9]\d{3}|arc/i.test(gpuName ?? "");

  return (
    <div className="opt-page">
      <header className="gp-head">
        <div>
          <h1>Optimiser</h1>
          <p className="gp-goal">Ce qui se lance au démarrage, ce qui tourne en ce moment et les réglages de Windows qui comptent pour le jeu.</p>
        </div>
        <button className="btn ghost" onClick={load} disabled={loading}>
          <Icon name="refresh" className={loading ? "spin" : ""} /> Actualiser
        </button>
      </header>

      {!app && <p className="muted small">Aperçu avec des données d'exemple : dans l'application, PCEvolu lit ton PC.</p>}
      {error && <p className="error">Lecture impossible : {error}</p>}

      {data && (
        <>
          <section className="answer opt-answer">
            <h2 className="answer-title">
              {enabled.length} programme{enabled.length > 1 ? "s" : ""} au démarrage
              {removable.length ? `, dont ${removable.length} désactivable${removable.length > 1 ? "s" : ""} sans risque` : ""}
            </h2>
            <p className="answer-sub">
              Mémoire utilisée : {gb(data.ramUsedBytes)} sur {gb(data.ramTotalBytes)} ({ramPct} %).{" "}
              {ramPct >= 85
                ? "C'est beaucoup : ferme les applications inutiles avant de jouer, ou ajoute de la RAM."
                : "Il reste de la marge."}
            </p>
          </section>

          <div className="seg opt-tabs" role="tablist" aria-label="Sections">
            <button role="tab" aria-selected={tab === "startup"} className={tab === "startup" ? "on" : ""} onClick={() => setTab("startup")}>
              Au démarrage de Windows <span className="opt-count">{enabled.length}</span>
            </button>
            <button role="tab" aria-selected={tab === "running"} className={tab === "running" ? "on" : ""} onClick={() => setTab("running")}>
              En cours d'exécution <span className="opt-count">{data.processes.length}</span>
            </button>
            <button role="tab" aria-selected={tab === "tweaks"} className={tab === "tweaks" ? "on" : ""} onClick={() => setTab("tweaks")}>
              Réglages Windows
            </button>
          </div>
          {toggleError && <p className="opt-error opt-tab-error">{toggleError}</p>}

          {tab === "startup" && (
          <section className="opt-sec">
            <div className="opt-sec-head">
              <h3 className="imp-h">Au démarrage de Windows</h3>
              <button className="link small" onClick={() => open("startup")}>
                Ouvrir le réglage Windows
              </button>
            </div>
            <p className="opt-intro">
              Désactiver un programme l'empêche seulement de se lancer tout seul : il reste installé et tu peux toujours l'ouvrir. Tu peux le réactiver
              ici à tout moment.
            </p>
            <ul className="opt-list">
              {startup.map(({ s, k }) => (
                <li key={`${s.location}-${s.name}`} className={`opt-item ${s.enabled ? "" : "off"}`}>
                  <span className="opt-ico">
                    <BrandLogo brand={`${s.name} ${s.command}`} />
                  </span>
                  <div className="opt-main">
                    <div className="opt-name">
                      {displayName(s, k)}
                      <span className={`opt-tag v-${k?.verdict ?? "unknown"}`}>{VERDICT_TEXT[k?.verdict ?? "unknown"]}</span>
                    </div>
                    <div className="opt-why">{k?.why ?? "Programme non répertorié : ne le désactive que si tu sais à quoi il sert."}</div>
                    <div className="opt-cmd" title={s.command}>
                      {s.command}
                    </div>
                  </div>
                  <button
                    className={`switch ${s.enabled ? "on" : ""}`}
                    role="switch"
                    aria-checked={s.enabled}
                    aria-label={`${s.enabled ? "Désactiver" : "Activer"} ${displayName(s, k)} au démarrage`}
                    onClick={() => toggle(s)}
                    disabled={!app}
                    title={s.userScope ? undefined : "Installé pour tous les utilisateurs : peut demander les droits administrateur"}
                  >
                    <i />
                  </button>
                </li>
              ))}
            </ul>
          </section>
          )}

          {tab === "running" && (
          <section className="opt-sec">
            <div className="opt-sec-head">
              <h3 className="imp-h">En cours d'exécution</h3>
              <div className="seg opt-sort" role="tablist">
                <button className={sort === "memory" ? "on" : ""} onClick={() => setSort("memory")}>
                  Mémoire
                </button>
                <button className={sort === "cpu" ? "on" : ""} onClick={() => setSort("cpu")}>
                  Processeur
                </button>
              </div>
            </div>
            <p className="opt-intro">
              Les programmes ouverts, regroupés par nom. « Fermer » arrête toutes ses fenêtres d'un coup, comme « Fin de tâche » : le travail non
              enregistré est perdu. Les éléments de Windows ne peuvent pas être fermés d'ici.{" "}
              <button className="link" onClick={() => open("taskmgr")}>
                Ouvrir le Gestionnaire des tâches
              </button>
            </p>
            {killMsg && <p className={killMsg.ok ? "opt-ok" : "opt-error"}>{killMsg.text}</p>}
            <table className="opt-table">
              <thead>
                <tr>
                  <th>Programme</th>
                  <th className="num">Processeur</th>
                  <th className="num">Mémoire</th>
                  <th aria-label="Action" />
                </tr>
              </thead>
              <tbody>
                {procs.map((p) => (
                  <tr key={p.name} className={confirmKill === p.name ? "confirming" : ""}>
                    <td>
                      <span className="opt-pname">
                        <BrandLogo brand={p.name} />
                        {p.name}
                        {p.count > 1 && <span className="muted small"> × {p.count}</span>}
                      </span>
                      {hint(p.name) && <span className="opt-phint">{hint(p.name)}</span>}
                    </td>
                    <td className="num">{p.cpuPercent < 0.1 ? "< 0,1 %" : `${p.cpuPercent.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`}</td>
                    <td className="num">{mb(p.memoryBytes)}</td>
                    <td className="opt-act">
                      {p.protected ? (
                        <span className="muted small" title="Élément de Windows (ou de PCEvolu) : le fermer pourrait bloquer le PC.">
                          Protégé
                        </span>
                      ) : confirmKill === p.name ? (
                        <span className="opt-confirm">
                          <span className="small">
                            Fermer{p.count > 1 ? ` (${p.count} processus)` : ""} ?
                          </span>
                          <button className="btn danger sm" onClick={() => endProcess(p)}>
                            Oui, fermer
                          </button>
                          <button className="link small" onClick={() => setConfirmKill(undefined)}>
                            Annuler
                          </button>
                        </span>
                      ) : (
                        <button className="btn ghost sm" onClick={() => setConfirmKill(p.name)} disabled={killing === p.name}>
                          {killing === p.name ? "Fermeture…" : "Fermer"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(data.processes.length ?? 0) > 12 && (
              <button className="link small" onClick={() => setShowAllProc(!showAllProc)}>
                {showAllProc ? "Afficher moins" : `Afficher les ${data.processes.length} programmes`}
              </button>
            )}
          </section>
          )}

          {tab === "tweaks" && (
          <section className="opt-sec">
            <h3 className="imp-h">Réglages de Windows pour le jeu</h3>
            <ul className="opt-tweaks">
              <Tweak
                ok={planOk}
                title={`Mode d'alimentation : ${planName}`}
                text={plan?.note ?? (planOk ? "Plan personnalisé ou du fabricant : rien à changer s'il ne bride pas le processeur." : "Bride le processeur : à éviter sur un PC de jeu fixe.")}
                action="Ouvrir le réglage"
                onAction={() => open("power")}
              />
              <Tweak
                ok={t?.gameMode !== false}
                title={`Mode Jeu : ${t?.gameMode === false ? "désactivé" : "activé"}`}
                text={t?.gameMode === false ? "Active-le : Windows donne la priorité au jeu en cours et suspend certaines tâches de fond." : "Windows donne la priorité au jeu en cours."}
                action="Ouvrir le réglage"
                onAction={() => open("gamemode")}
              />
              <Tweak
                ok={t?.hags !== false || !recentGpu}
                neutral={t?.hags == null}
                title={`Planification GPU à accélération matérielle : ${t?.hags == null ? "réglage par défaut" : t.hags ? "activée" : "désactivée"}`}
                text={
                  recentGpu
                    ? "Avec une carte graphique récente, l'activer réduit un peu la latence et est nécessaire à la génération d'images (DLSS 3 / FSR 3). Redémarrage requis après changement."
                    : "Utile surtout avec une carte graphique récente (RTX, Radeon RX 6000 ou plus)."
                }
                action="Ouvrir le réglage"
                onAction={() => open("graphics")}
              />
              <Tweak
                ok={(t?.tempBytes ?? 0) < 2 * 1024 ** 3}
                title={`Fichiers temporaires : ${mb(t?.tempBytes ?? 0)}`}
                text={(t?.tempBytes ?? 0) >= 2 * 1024 ** 3 ? "Ça fait beaucoup : l'Assistant de stockage de Windows peut les supprimer sans risque." : "Rien d'inquiétant."}
                action="Nettoyer avec Windows"
                onAction={() => open("storage")}
              />
            </ul>
          </section>
          )}
        </>
      )}
      {loading && !data && <p className="muted">Lecture en cours…</p>}
    </div>
  );
}

function Tweak({ ok, neutral, title, text, action, onAction }: { ok: boolean; neutral?: boolean; title: string; text: string; action: string; onAction: () => void }) {
  return (
    <li className={`opt-tweak ${neutral ? "neutral" : ok ? "ok" : "warn"}`}>
      <Icon name={neutral ? "spark" : ok ? "check" : "alert"} />
      <div>
        <div className="opt-tweak-title">{title}</div>
        <div className="opt-why">{text}</div>
      </div>
      <button className="link small" onClick={onAction}>
        {action}
      </button>
    </li>
  );
}
