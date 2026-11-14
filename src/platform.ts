// Fonctions qui dépendent de l'environnement : app de bureau (Tauri) ou simple navigateur (mode démo).

import { isTauri } from "@tauri-apps/api/core";

/** Ouvre un lien dans le navigateur par défaut de l'utilisateur. */
export async function openUrl(url: string) {
  if (isTauri()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } else {
    window.open(url, "_blank", "noopener");
  }
}

/** Affiche une notification système (Windows), en demandant l'autorisation la première fois. */
export async function notify(title: string, body: string) {
  try {
    if (isTauri()) {
      const n = await import("@tauri-apps/plugin-notification");
      let granted = await n.isPermissionGranted();
      if (!granted) granted = (await n.requestPermission()) === "granted";
      if (granted) n.sendNotification({ title, body });
    } else if ("Notification" in window) {
      if (Notification.permission === "default") await Notification.requestPermission();
      if (Notification.permission === "granted") new Notification(title, { body });
    }
  } catch {
    /* notifications indisponibles : l'alerte reste visible dans l'app */
  }
}

/** Recherche Google Shopping (France) pour comparer les prix d'un composant. */
export const shoppingSearchUrl = (query: string) => `https://www.google.com/search?tbm=shop&hl=fr&gl=fr&q=${encodeURIComponent(query)}`;
