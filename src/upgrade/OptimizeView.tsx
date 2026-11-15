// Page « Optimiser » : programmes au démarrage, processus en cours et réglages Windows utiles au jeu.

import { useEffect, useMemo, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { BrandLogo, Icon } from "../icons";
import { currentLang, tr } from "../settings";

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

/** Traductions anglaises de KNOWN, indexées par le libellé français : [libellé, explication]. Lues à l'affichage. */
const KNOWN_EN: Record<string, [string, string]> = {
  "Sécurité Windows": ["Windows Security", "The Windows Security (antivirus) icon: keep it."],
  Antivirus: ["Antivirus", "Your antivirus needs to start with Windows to protect you."],
  "Riot Vanguard": ["Riot Vanguard", "Anti-cheat for Valorant and League of Legends: only keep it if you play those games (they restart it when needed)."],
  "Pilote audio": ["Audio driver", "Part of the sound driver (effects, headphone jack): keep it."],
  "Pilote de pavé tactile / tablette": ["Touchpad / tablet driver", "Handles the touchpad or graphics tablet: keep it."],
  "Pilote graphique Intel": ["Intel graphics driver", "Part of the graphics driver: keep it."],
  NVIDIA: ["NVIDIA", "NVIDIA services (overlay, driver updates): you can disable them if you don't use the overlay or recording."],
  "AMD Software": ["AMD Software", "AMD software (overlay, settings): you can disable it, the driver works without it."],
  "Logitech G HUB": ["Logitech G HUB", "Keep it if you use mouse, keyboard or lighting profiles; otherwise you can disable it."],
  "Corsair iCUE": ["Corsair iCUE", "Keep it if you use Corsair lighting or macros; otherwise you can disable it."],
  "Razer Synapse": ["Razer Synapse", "Keep it if you use Razer profiles; otherwise you can disable it."],
  Steam: ["Steam", "Opens when you launch a game: no need for it at startup."],
  "Epic Games Launcher": ["Epic Games Launcher", "Opens when you launch a game: no need for it at startup."],
  "EA app": ["EA app", "Opens when you launch an EA game: no need for it at startup."],
  "Ubisoft Connect": ["Ubisoft Connect", "Opens when you launch a Ubisoft game: no need for it at startup."],
  "Battle.net": ["Battle.net", "Opens when you launch a Blizzard game: no need for it at startup."],
  "Riot Client": ["Riot Client", "Opens when you launch a Riot game: no need for it at startup."],
  "GOG Galaxy": ["GOG Galaxy", "No need for it at startup."],
  Discord: ["Discord", "You can open it when you need it: it starts in a few seconds."],
  Spotify: ["Spotify", "No need for it at startup."],
  "Messagerie / visio": ["Messaging / video calls", "You can open it when you need it."],
  "Microsoft Edge (préchargement)": ["Microsoft Edge (preloading)", "Preloads Edge in the background: not needed if it isn't your main browser."],
  "Google Chrome (préchargement)": ["Google Chrome (preloading)", "Preloads Chrome in the background: it starts just fine without it."],
  Navigateur: ["Browser", "No need for it at startup."],
  OneDrive: ["OneDrive", "Keep it if you sync your files (Desktop, Documents) with OneDrive; otherwise you can disable it."],
  "Synchronisation de fichiers": ["File sync", "Keep it if you sync files all the time; otherwise you can disable it."],
  "iTunes Helper": ["iTunes Helper", "Only used to connect an iPhone / iPod: you can disable it."],
  "Mise à jour Java": ["Java Update", "Checks for Java updates: you can disable it."],
  Adobe: ["Adobe", "Adobe updates and services: you can disable them."],
  Utilitaire: ["Utility", "No need for it at startup."],
  VPN: ["VPN", "Keep it if you want the VPN on as soon as the PC starts; otherwise you can disable it."],
  "Utilitaire d'écran": ["Display utility", "Monitor settings software: you can disable it, the monitor works without it."],
  "Application Windows": ["Windows app", "No need for it at startup."],
};
const knownLabel = (k: Known) => tr(k.label, KNOWN_EN[k.label]?.[0]);
const knownWhy = (k: Known) => tr(k.why, KNOWN_EN[k.label]?.[1]);

const verdictText = (v: Verdict): string =>
  ({
    safe: tr("Désactivable sans risque", "Safe to disable"),
    depends: tr("Selon ton usage", "Depends on your use"),
    keep: tr("À garder", "Keep"),
    unknown: tr("Inconnu", "Unknown"),
  })[v];

function identify(item: StartupItem): Known | undefined {
  return KNOWN.find((k) => k.match.test(item.name) || k.match.test(item.command));
}

/** Nom lisible : « MicrosoftEdgeAutoLaunch_FC40… » → « Microsoft Edge (préchargement) ». */
const GENERIC_LABELS = new Set(["Antivirus", "Pilote audio", "Navigateur", "Utilitaire", "Messagerie / visio", "Synchronisation de fichiers", "Application Windows", "VPN", "Utilitaire d'écran", "Pilote de pavé tactile / tablette"]);
const displayName = (item: StartupItem, k?: Known) => (k && !GENERIC_LABELS.has(k.label) ? knownLabel(k) : item.name.replace(/\.lnk$/i, "").replace(/_[0-9A-F]{16,}$/i, ""));

/** Processus courants : ce qu'ils sont, pour ne pas fermer n'importe quoi. */
const PROCESS_HINT: [RegExp, string, string][] = [
  [/^(chrome|msedge|firefox|opera|brave)$/i, "Navigateur : chaque onglet et extension est un processus séparé.", "Browser: each tab and extension is a separate process."],
  [/^msedgewebview2$/i, "Composant Windows utilisé par certaines applications pour afficher leur interface.", "Windows component some apps use to display their interface."],
  [/^svchost$/i, "Services de Windows : à laisser.", "Windows services: leave them."],
  [/^(explorer|dwm|csrss|winlogon|lsass|services|smss|wininit|system|registry|memory compression)$/i, "Fait partie de Windows : à laisser.", "Part of Windows: leave it."],
  [/^(msmpeng|securityhealthservice|nissrv)$/i, "Antivirus Windows Defender : à laisser.", "Windows Defender antivirus: leave it."],
  [/^discord$/i, "Discord : ferme-le si tu ne l'utilises pas pendant tes parties.", "Discord: close it if you don't use it while gaming."],
  [/^(steam|steamwebhelper|epicgameslauncher|eadesktop|riotclientservices)$/i, "Lanceur de jeux : peut être fermé hors des parties.", "Game launcher: can be closed when you're not playing."],
  [/nvidia|nvcontainer/i, "Services NVIDIA (overlay, enregistrement).", "NVIDIA services (overlay, recording)."],
  [/^(searchhost|searchindexer)$/i, "Recherche Windows : à laisser.", "Windows Search: leave it."],
];
const hint = (name: string) => {
  const h = PROCESS_HINT.find(([re]) => re.test(name));
  return h && tr(h[1], h[2]);
};

/** Plans d'alimentation par défaut de Windows. */
const POWER: Record<string, { name: string; nameEn: string; ok: boolean; note: string; noteEn: string }> = {
  "381b4222-f694-41f0-9685-ff5bb260df2e": { name: "Équilibré", nameEn: "Balanced", ok: true, note: "Le bon choix pour la plupart des PC : le processeur monte en fréquence dès qu'il en a besoin.", noteEn: "The right choice for most PCs: the processor speeds up as soon as it needs to." },
  "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c": { name: "Performances élevées", nameEn: "High performance", ok: true, note: "Le processeur reste à pleine vitesse : un peu plus réactif, consomme davantage.", noteEn: "The processor stays at full speed: a bit more responsive, uses more power." },
  "e9a42b02-d5df-448d-aa00-03f14749eb61": { name: "Performances optimales", nameEn: "Ultimate performance", ok: true, note: "Le plus réactif, consomme davantage au repos.", noteEn: "The most responsive, uses more power when idle." },
  "a1841308-3541-4fab-bc81-f71556f20b4a": { name: "Économie d'énergie", nameEn: "Power saver", ok: false, note: "Bride le processeur : à éviter sur un PC de jeu fixe.", noteEn: "Holds back the processor: avoid it on a gaming desktop." },
};

const locale = () => (currentLang() === "en" ? "en-GB" : "fr-FR");
const gb = (b: number) => `${(b / 1024 ** 3).toLocaleString(locale(), { maximumFractionDigits: 1 })} ${tr("Go", "GB")}`;
const mb = (b: number) => (b >= 1024 ** 3 ? gb(b) : `${Math.round(b / 1024 ** 2).toLocaleString(locale())} ${tr("Mo", "MB")}`);

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
      setKillMsg({ ok: true, text: tr(`${p.name} fermé (aperçu : rien n'a été fermé pour de vrai).`, `${p.name} closed (preview: nothing was actually closed).`) });
      return;
    }
    setKilling(p.name);
    try {
      const n = await invoke<number>("end_process", { name: p.name });
      setKillMsg({ ok: true, text: tr(`${p.name} fermé${n > 1 ? ` (${n} processus)` : ""}.`, `${p.name} closed${n > 1 ? ` (${n} processes)` : ""}.`) });
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
  const planName = (plan && tr(plan.name, plan.nameEn)) ?? t?.powerPlanName ?? tr("inconnu", "unknown");
  const planOk = plan ? plan.ok : !/économie|saver/i.test(t?.powerPlanName ?? "");
  const ramPct = data ? Math.round((data.ramUsedBytes / data.ramTotalBytes) * 100) : 0;
  const recentGpu = /rtx|rx ?[6-9]\d{3}|arc/i.test(gpuName ?? "");

  return (
    <div className="opt-page">
      <header className="gp-head">
        <div>
          <h1>{tr("Optimiser", "Optimize")}</h1>
          <p className="gp-goal">{tr("Ce qui se lance au démarrage, ce qui tourne en ce moment et les réglages de Windows qui comptent pour le jeu.", "What launches at startup, what's running right now and the Windows settings that matter for gaming.")}</p>
        </div>
        <button className="btn ghost" onClick={load} disabled={loading}>
          <Icon name="refresh" className={loading ? "spin" : ""} /> {tr("Actualiser", "Refresh")}
        </button>
      </header>

      {!app && <p className="muted small">{tr("Aperçu avec des données d'exemple : dans l'application, PCEvolu lit ton PC.", "Preview with sample data: in the app, PCEvolu reads your PC.")}</p>}
      {error && <p className="error">{tr("Lecture impossible :", "Couldn't read your PC:")} {error}</p>}

      {data && (
        <>
          <section className="answer opt-answer">
            <h2 className="answer-title">
              {tr(
                `${enabled.length} programme${enabled.length > 1 ? "s" : ""} au démarrage`,
                `${enabled.length} program${enabled.length > 1 ? "s" : ""} at startup`,
              )}
              {removable.length
                ? tr(
                    `, dont ${removable.length} désactivable${removable.length > 1 ? "s" : ""} sans risque`,
                    `, ${removable.length} of which ${removable.length > 1 ? "are" : "is"} safe to disable`,
                  )
                : ""}
            </h2>
            <p className="answer-sub">
              {tr(
                `Mémoire utilisée : ${gb(data.ramUsedBytes)} sur ${gb(data.ramTotalBytes)} (${ramPct} %).`,
                `Memory in use: ${gb(data.ramUsedBytes)} of ${gb(data.ramTotalBytes)} (${ramPct}%).`,
              )}{" "}
              {ramPct >= 85
                ? tr("C'est beaucoup : ferme les applications inutiles avant de jouer, ou ajoute de la RAM.", "That's a lot: close apps you don't need before playing, or add more RAM.")
                : tr("Il reste de la marge.", "There's still room to spare.")}
            </p>
          </section>

          <div className="seg opt-tabs" role="tablist" aria-label="Sections">
            <button role="tab" aria-selected={tab === "startup"} className={tab === "startup" ? "on" : ""} onClick={() => setTab("startup")}>
              {tr("Au démarrage de Windows", "At Windows startup")} <span className="opt-count">{enabled.length}</span>
            </button>
            <button role="tab" aria-selected={tab === "running"} className={tab === "running" ? "on" : ""} onClick={() => setTab("running")}>
              {tr("En cours d'exécution", "Running now")} <span className="opt-count">{data.processes.length}</span>
            </button>
            <button role="tab" aria-selected={tab === "tweaks"} className={tab === "tweaks" ? "on" : ""} onClick={() => setTab("tweaks")}>
              {tr("Réglages Windows", "Windows settings")}
            </button>
          </div>
          {toggleError && <p className="opt-error opt-tab-error">{toggleError}</p>}

          {tab === "startup" && (
          <section className="opt-sec">
            <div className="opt-sec-head">
              <h3 className="imp-h">{tr("Au démarrage de Windows", "At Windows startup")}</h3>
              <button className="link small" onClick={() => open("startup")}>
                {tr("Ouvrir le réglage Windows", "Open Windows setting")}
              </button>
            </div>
            <p className="opt-intro">
              {tr(
                "Désactiver un programme l'empêche seulement de se lancer tout seul : il reste installé et tu peux toujours l'ouvrir. Tu peux le réactiver ici à tout moment.",
                "Disabling a program only stops it from launching on its own: it stays installed and you can still open it. You can turn it back on here at any time.",
              )}
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
                      <span className={`opt-tag v-${k?.verdict ?? "unknown"}`}>{verdictText(k?.verdict ?? "unknown")}</span>
                    </div>
                    <div className="opt-why">{k ? knownWhy(k) : tr("Programme non répertorié : ne le désactive que si tu sais à quoi il sert.", "Unlisted program: only disable it if you know what it's for.")}</div>
                    <div className="opt-cmd" title={s.command}>
                      {s.command}
                    </div>
                  </div>
                  <button
                    className={`switch ${s.enabled ? "on" : ""}`}
                    role="switch"
                    aria-checked={s.enabled}
                    aria-label={tr(`${s.enabled ? "Désactiver" : "Activer"} ${displayName(s, k)} au démarrage`, `${s.enabled ? "Disable" : "Enable"} ${displayName(s, k)} at startup`)}
                    onClick={() => toggle(s)}
                    disabled={!app}
                    title={s.userScope ? undefined : tr("Installé pour tous les utilisateurs : peut demander les droits administrateur", "Installed for all users: may ask for administrator rights")}
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
              <h3 className="imp-h">{tr("En cours d'exécution", "Running now")}</h3>
              <div className="seg opt-sort" role="tablist">
                <button className={sort === "memory" ? "on" : ""} onClick={() => setSort("memory")}>
                  {tr("Mémoire", "Memory")}
                </button>
                <button className={sort === "cpu" ? "on" : ""} onClick={() => setSort("cpu")}>
                  {tr("Processeur", "Processor")}
                </button>
              </div>
            </div>
            <p className="opt-intro">
              {tr(
                "Les programmes ouverts, regroupés par nom. « Fermer » arrête toutes ses fenêtres d'un coup, comme « Fin de tâche » : le travail non enregistré est perdu. Les éléments de Windows ne peuvent pas être fermés d'ici.",
                "Open programs, grouped by name. “Close” stops all of its windows at once, like “End task”: unsaved work is lost. Windows components can't be closed from here.",
              )}{" "}
              <button className="link" onClick={() => open("taskmgr")}>
                {tr("Ouvrir le Gestionnaire des tâches", "Open Task Manager")}
              </button>
            </p>
            {killMsg && <p className={killMsg.ok ? "opt-ok" : "opt-error"}>{killMsg.text}</p>}
            <table className="opt-table">
              <thead>
                <tr>
                  <th>{tr("Programme", "Program")}</th>
                  <th className="num">{tr("Processeur", "Processor")}</th>
                  <th className="num">{tr("Mémoire", "Memory")}</th>
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
                    <td className="num">{p.cpuPercent < 0.1 ? tr("< 0,1 %", "< 0.1%") : `${p.cpuPercent.toLocaleString(locale(), { maximumFractionDigits: 1 })}${tr(" %", "%")}`}</td>
                    <td className="num">{mb(p.memoryBytes)}</td>
                    <td className="opt-act">
                      {p.protected ? (
                        <span className="muted small" title={tr("Élément de Windows (ou de PCEvolu) : le fermer pourrait bloquer le PC.", "Part of Windows (or PCEvolu): closing it could freeze the PC.")}>
                          {tr("Protégé", "Protected")}
                        </span>
                      ) : confirmKill === p.name ? (
                        <span className="opt-confirm">
                          <span className="small">
                            {tr(`Fermer${p.count > 1 ? ` (${p.count} processus)` : ""} ?`, `Close${p.count > 1 ? ` (${p.count} processes)` : ""}?`)}
                          </span>
                          <button className="btn danger sm" onClick={() => endProcess(p)}>
                            {tr("Oui, fermer", "Yes, close")}
                          </button>
                          <button className="link small" onClick={() => setConfirmKill(undefined)}>
                            {tr("Annuler", "Cancel")}
                          </button>
                        </span>
                      ) : (
                        <button className="btn ghost sm" onClick={() => setConfirmKill(p.name)} disabled={killing === p.name}>
                          {killing === p.name ? tr("Fermeture…", "Closing…") : tr("Fermer", "Close")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(data.processes.length ?? 0) > 12 && (
              <button className="link small" onClick={() => setShowAllProc(!showAllProc)}>
                {showAllProc ? tr("Afficher moins", "Show less") : tr(`Afficher les ${data.processes.length} programmes`, `Show all ${data.processes.length} programs`)}
              </button>
            )}
          </section>
          )}

          {tab === "tweaks" && (
          <section className="opt-sec">
            <h3 className="imp-h">{tr("Réglages de Windows pour le jeu", "Windows settings for gaming")}</h3>
            <ul className="opt-tweaks">
              <Tweak
                ok={planOk}
                title={tr(`Mode d'alimentation : ${planName}`, `Power mode: ${planName}`)}
                text={(plan && tr(plan.note, plan.noteEn)) ?? (planOk ? tr("Plan personnalisé ou du fabricant : rien à changer s'il ne bride pas le processeur.", "Custom or manufacturer plan: nothing to change as long as it doesn't hold back the processor.") : tr("Bride le processeur : à éviter sur un PC de jeu fixe.", "Holds back the processor: avoid it on a gaming desktop."))}
                action={tr("Ouvrir le réglage", "Open setting")}
                onAction={() => open("power")}
              />
              <Tweak
                ok={t?.gameMode !== false}
                title={tr(`Mode Jeu : ${t?.gameMode === false ? "désactivé" : "activé"}`, `Game Mode: ${t?.gameMode === false ? "off" : "on"}`)}
                text={t?.gameMode === false ? tr("Active-le : Windows donne la priorité au jeu en cours et suspend certaines tâches de fond.", "Turn it on: Windows prioritizes the game you're playing and pauses some background tasks.") : tr("Windows donne la priorité au jeu en cours.", "Windows prioritizes the game you're playing.")}
                action={tr("Ouvrir le réglage", "Open setting")}
                onAction={() => open("gamemode")}
              />
              <Tweak
                ok={t?.hags !== false || !recentGpu}
                neutral={t?.hags == null}
                title={tr(
                  `Planification GPU à accélération matérielle : ${t?.hags == null ? "réglage par défaut" : t.hags ? "activée" : "désactivée"}`,
                  `Hardware-accelerated GPU scheduling: ${t?.hags == null ? "default setting" : t.hags ? "on" : "off"}`,
                )}
                text={
                  recentGpu
                    ? tr(
                        "Avec une carte graphique récente, l'activer réduit un peu la latence et est nécessaire à la génération d'images (DLSS 3 / FSR 3). Redémarrage requis après changement.",
                        "With a recent graphics card, turning it on slightly reduces latency and is required for frame generation (DLSS 3 / FSR 3). Restart required after changing it.",
                      )
                    : tr("Utile surtout avec une carte graphique récente (RTX, Radeon RX 6000 ou plus).", "Mostly useful with a recent graphics card (RTX, Radeon RX 6000 or newer).")
                }
                action={tr("Ouvrir le réglage", "Open setting")}
                onAction={() => open("graphics")}
              />
              <Tweak
                ok={(t?.tempBytes ?? 0) < 2 * 1024 ** 3}
                title={tr(`Fichiers temporaires : ${mb(t?.tempBytes ?? 0)}`, `Temporary files: ${mb(t?.tempBytes ?? 0)}`)}
                text={(t?.tempBytes ?? 0) >= 2 * 1024 ** 3 ? tr("Ça fait beaucoup : l'Assistant de stockage de Windows peut les supprimer sans risque.", "That's a lot: Windows Storage Sense can safely delete them.") : tr("Rien d'inquiétant.", "Nothing to worry about.")}
                action={tr("Nettoyer avec Windows", "Clean up with Windows")}
                onAction={() => open("storage")}
              />
            </ul>
          </section>
          )}
        </>
      )}
      {loading && !data && <p className="muted">{tr("Lecture en cours…", "Reading your PC…")}</p>}
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
