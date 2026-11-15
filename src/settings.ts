// Préférences de l'utilisateur : langue, thème, vérification des mises à jour. Gardées dans le stockage local.

import { createContext, useContext } from "react";
import { isTauri } from "@tauri-apps/api/core";

export type Lang = "fr" | "en";
export type Theme = "system" | "light" | "dark";

export interface Settings {
  lang: Lang;
  theme: Theme;
  /** Vérifier les nouvelles versions au lancement. */
  autoUpdate: boolean;
}

const KEY = "pcevolu.settings.v1";
const DEFAULTS: Settings = { lang: navigator.language?.toLowerCase().startsWith("fr") ? "fr" : "en", theme: "system", autoUpdate: true };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    // Utilisateurs déjà installés (sans réglages enregistrés) : on garde le français qu'ils connaissent.
    if (!raw) return localStorage.getItem("pcevolu.welcomed.v1") ? { ...DEFAULTS, lang: "fr" } : DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* stockage indisponible : réglage gardé pour cette session */
  }
}

/** Applique le thème à la page et à la barre de titre de la fenêtre Windows. */
export async function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  if (isTauri()) {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().setTheme(theme === "system" ? null : theme);
    } catch {
      /* barre de titre : on garde celle de Windows */
    }
  }
}

// ---------------------------------------------------------------------------
// Traduction
// ---------------------------------------------------------------------------

let current: Lang = loadSettings().lang;
export const setCurrentLang = (l: Lang) => {
  current = l;
  document.documentElement.lang = l;
};
export const currentLang = () => current;

/**
 * Texte dans la langue choisie : tr("Réanalyser", "Rescan").
 * Les pages sont traduites au fur et à mesure ; sans traduction anglaise, le français reste affiché.
 */
export function tr(fr: string, en?: string): string {
  return current === "en" && en ? en : fr;
}

export interface SettingsCtx {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}
export const SettingsContext = createContext<SettingsCtx>({ settings: loadSettings(), update: () => {} });
export const useSettings = () => useContext(SettingsContext);
