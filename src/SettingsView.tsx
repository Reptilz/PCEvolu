// Page « Paramètres » : langue, thème, mises à jour, confidentialité et informations sur l'app.

import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { Icon, type IconName } from "./icons";
import { appVersion, openReport } from "./report";
import { tr, useSettings, type Lang, type Theme } from "./settings";
import { checkUpdate } from "./UpdateBanner";
import { openUrl } from "./platform";

type Tab = "general" | "updates" | "privacy" | "about";

const LINKEDIN = "https://www.linkedin.com/in/jordan-morlet-18481619a/";

export function SettingsView() {
  const [tab, setTab] = useState<Tab>("general");
  const tabs: { id: Tab; icon: IconName; label: string }[] = [
    { id: "general", icon: "gear", label: tr("Général", "General") },
    { id: "updates", icon: "refresh", label: tr("Mises à jour", "Updates") },
    { id: "privacy", icon: "shield", label: tr("Confidentialité", "Privacy") },
    { id: "about", icon: "info", label: tr("À propos", "About") },
  ];
  return (
    <div className="settings-page">
      <header className="gp-head">
        <div>
          <h1>{tr("Paramètres", "Settings")}</h1>
        </div>
      </header>
      <div className="settings-tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
            <Icon name={t.icon} />
            {t.label}
          </button>
        ))}
      </div>
      {tab === "general" && <General />}
      {tab === "updates" && <Updates />}
      {tab === "privacy" && <Privacy />}
      {tab === "about" && <About />}
    </div>
  );
}

function General() {
  const { settings, update } = useSettings();
  const themes: { id: Theme; label: string }[] = [
    { id: "light", label: tr("Clair", "Light") },
    { id: "dark", label: tr("Sombre", "Dark") },
    { id: "system", label: tr("Système", "System") },
  ];
  return (
    <>
      <section className="set-sec">
        <h2 className="set-h">{tr("Langue", "Language")}</h2>
        <select className="set-select" value={settings.lang} onChange={(e) => update({ lang: e.target.value as Lang })} aria-label={tr("Langue", "Language")}>
          <option value="fr">Français</option>
          <option value="en">English</option>
        </select>
        {settings.lang === "en" && (
          <p className="muted small set-note">
            The English version is in progress: the menus and settings are translated, and the other pages switch to English as their translation is
            completed. Untranslated text stays in French.
          </p>
        )}
      </section>

      <section className="set-sec">
        <h2 className="set-h">{tr("Thème", "Theme")}</h2>
        <p className="muted set-sub">{tr("Choisis l'apparence de PCEvolu.", "Choose how PCEvolu looks.")}</p>
        <div className="theme-cards" role="radiogroup" aria-label={tr("Thème", "Theme")}>
          {themes.map((t) => (
            <label key={t.id} className={`theme-card ${settings.theme === t.id ? "on" : ""}`}>
              <ThemePreview kind={t.id} />
              <span className="theme-radio">
                <input type="radio" name="theme" checked={settings.theme === t.id} onChange={() => update({ theme: t.id })} />
                {t.label}
              </span>
            </label>
          ))}
        </div>
        {settings.theme === "system" && <p className="muted small set-note">{tr("Suit le mode clair ou sombre choisi dans Windows.", "Follows the light or dark mode set in Windows.")}</p>}
      </section>
    </>
  );
}

/** Miniature de l'interface dans chaque thème. */
function ThemePreview({ kind }: { kind: Theme }) {
  const mini = (mode: "light" | "dark") => (
    <div className={`tp tp-${mode}`}>
      <div className="tp-side">
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="tp-main">
        <b />
        <i />
        <i />
        <i className="short" />
        <span className="tp-card" />
      </div>
    </div>
  );
  if (kind !== "system") return <div className="theme-preview">{mini(kind)}</div>;
  return (
    <div className="theme-preview split">
      {mini("dark")}
      {mini("light")}
    </div>
  );
}

function Updates() {
  const { settings, update } = useSettings();
  const [version, setVersion] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "uptodate" | "found" | "error">("idle");
  const [found, setFound] = useState("");
  useEffect(() => {
    appVersion().then(setVersion);
  }, []);
  const check = async () => {
    setStatus("checking");
    try {
      const u = await checkUpdate();
      if (u) {
        setFound(u.version);
        setStatus("found");
        window.dispatchEvent(new CustomEvent("pcevolu:update", { detail: u }));
      } else setStatus("uptodate");
    } catch {
      setStatus("error");
    }
  };
  return (
    <>
      <section className="set-sec">
        <h2 className="set-h">{tr("Version installée", "Installed version")}</h2>
        <p className="set-big">PCEvolu {version}</p>
        <div className="set-row">
          <button className="btn" onClick={check} disabled={!isTauri() || status === "checking"}>
            <Icon name="refresh" className={status === "checking" ? "spin" : ""} />
            {status === "checking" ? tr("Recherche…", "Checking…") : tr("Rechercher une mise à jour", "Check for updates")}
          </button>
          <span className="muted">
            {status === "uptodate" && tr("PCEvolu est à jour.", "PCEvolu is up to date.")}
            {status === "found" && tr(`La version ${found} est disponible : utilise la bannière en haut de la page.`, `Version ${found} is available: use the banner at the top of the page.`)}
            {status === "error" && tr("Impossible de vérifier : es-tu connecté à internet ?", "Couldn't check: are you online?")}
            {!isTauri() && tr("Disponible dans l'application.", "Available in the desktop app.")}
          </span>
        </div>
      </section>
      <section className="set-sec">
        <label className="set-toggle">
          <button
            className={`switch ${settings.autoUpdate ? "on" : ""}`}
            role="switch"
            aria-checked={settings.autoUpdate}
            onClick={() => update({ autoUpdate: !settings.autoUpdate })}
          >
            <i />
          </button>
          <span>
            <b>{tr("Rechercher les mises à jour au lancement", "Check for updates at startup")}</b>
            <span className="muted">
              {tr(
                "PCEvolu te propose la nouvelle version ; rien ne s'installe sans ton accord.",
                "PCEvolu offers the new version; nothing installs without your approval.",
              )}
            </span>
          </span>
        </label>
      </section>
    </>
  );
}

function Privacy() {
  const items: [string, string][] = [
    [
      tr("L'analyse de ton PC reste sur ton PC.", "Your PC scan stays on your PC."),
      tr(
        "Composants, programmes au démarrage, processus : tout est lu et calculé sur place. Rien n'est envoyé.",
        "Components, startup programs, processes: everything is read and computed locally. Nothing is sent.",
      ),
    ],
    [
      tr("Les prix sont téléchargés, pas envoyés.", "Prices are downloaded, not uploaded."),
      tr(
        "PCEvolu télécharge chaque semaine le relevé des prix et le catalogue depuis GitHub. Ces requêtes ne contiennent aucune information sur toi ou ton PC.",
        "Each week PCEvolu downloads the price list and catalogue from GitHub. These requests contain no information about you or your PC.",
      ),
    ],
    [
      tr("Un signalement part seulement quand tu l'envoies.", "A report is only sent when you send it."),
      tr(
        "Le formulaire « Signaler une erreur » montre exactement ce qui sera envoyé. Tu peux décocher la fiche du PC et laisser l'email vide.",
        "The “Report an error” form shows exactly what will be sent. You can untick the PC details and leave the email empty.",
      ),
    ],
    [
      tr("Pas de compte, pas de pistage, pas de publicité.", "No account, no tracking, no ads."),
      tr(
        "Tes choix (objectif, sélection, alertes prix, réglages) sont gardés sur ton PC uniquement.",
        "Your choices (goal, selection, price alerts, settings) are stored on your PC only.",
      ),
    ],
  ];
  return (
    <section className="set-sec">
      <ul className="set-list">
        {items.map(([title, text]) => (
          <li key={title}>
            <Icon name="check" />
            <span>
              <b>{title}</b>
              <span className="muted">{text}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function About() {
  const [version, setVersion] = useState("");
  useEffect(() => {
    appVersion().then(setVersion);
  }, []);
  return (
    <>
      <section className="set-sec about">
        <div className="logo about-logo">
          <Icon name="up" />
        </div>
        <div>
          <p className="set-big">PCEvolu {version}</p>
          <p className="muted">
            {tr(
              "Analyse ton PC et te dit ce qu'il vaut la peine d'améliorer, au bon prix.",
              "Scans your PC and tells you what's worth upgrading, at the right price.",
            )}
          </p>
        </div>
      </section>
      <section className="set-sec about-author">
        <span className="muted">{tr("Développé par", "Developed by")}</span>{" "}
        <button className="link" onClick={() => openUrl(LINKEDIN)} title="LinkedIn">
          Jordan Morlet ↗
        </button>
      </section>
      <section className="set-sec set-row">
        <button className="btn" onClick={() => openReport({ topic: tr("page Paramètres", "Settings page"), kind: "autre", details: [] })}>
          <Icon name="alert" /> {tr("Signaler une erreur", "Report an error")}
        </button>
      </section>
      <p className="muted small">
        {tr(
          "Prix relevés sur Google Shopping France. Logos de marques : Simple Icons (CC0). Les marques citées appartiennent à leurs propriétaires.",
          "Prices collected from Google Shopping France. Brand logos: Simple Icons (CC0). Trademarks belong to their owners.",
        )}
      </p>
    </>
  );
}
