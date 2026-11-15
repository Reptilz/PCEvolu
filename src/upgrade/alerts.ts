// Alertes de prix : « préviens-moi quand ce composant passe sous X € ».
// Vérifiées à chaque ouverture de l'app, quand les nouveaux prix sont chargés (relevé hebdomadaire).

import { priceInfo } from "./prices";
import { notify } from "../platform";
import { currentLang, tr } from "../settings";

export interface PriceAlert {
  id: string;
  name: string;
  /** Prix visé, en euros. */
  target: number;
  /** Meilleur prix au moment où l'alerte a été créée. */
  startPrice?: number;
  createdAt: string;
  /** Dernier prix pour lequel une notification a été envoyée (évite de notifier deux fois le même prix). */
  notifiedAt?: number;
}

const KEY = "pcevolu.alerts.v1";

export function loadAlerts(): PriceAlert[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveAlerts(a: PriceAlert[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(a));
  } catch {
    /* stockage indisponible */
  }
}

/** Meilleur prix actuel (offre la moins chère retenue au dernier relevé). */
export function bestPriceOf(id: string): number | undefined {
  const info = priceInfo(id);
  return info ? (info.best?.[0]?.price ?? info.min) : undefined;
}

export function isTriggered(a: PriceAlert): boolean {
  const p = bestPriceOf(a.id);
  return p != null && p <= a.target;
}

/** Prix visé proposé par défaut : 5 % sous le meilleur prix actuel, arrondi à 5 €. */
export function suggestedTarget(id: string, fallback: number): number {
  const p = bestPriceOf(id) ?? fallback;
  return Math.max(5, Math.floor((p * 0.95) / 5) * 5);
}

/**
 * Vérifie les alertes avec les prix fraîchement chargés : notification Windows pour chaque alerte atteinte
 * à un nouveau prix. Renvoie les alertes mises à jour.
 */
export async function checkAlerts(alerts: PriceAlert[]): Promise<PriceAlert[]> {
  const hits = alerts.filter((a) => isTriggered(a) && a.notifiedAt !== bestPriceOf(a.id));
  if (hits.length === 0) return alerts;
  if (hits.length === 1) {
    const a = hits[0];
    await notify(
      tr("Baisse de prix 📉", "Price drop 📉"),
      tr(`${a.name} est à ${eur(bestPriceOf(a.id)!)} (ton seuil : ${eur(a.target)}).`, `${a.name} is now ${eur(bestPriceOf(a.id)!)} (your target: ${eur(a.target)}).`),
    );
  } else {
    await notify(
      tr("Baisses de prix 📉", "Price drops 📉"),
      tr(
        `${hits.length} composants que tu surveilles sont passés sous ton seuil : ${hits.map((h) => h.name).join(", ")}.`,
        `${hits.length} parts you're watching have dropped below your target: ${hits.map((h) => h.name).join(", ")}.`,
      ),
    );
  }
  return alerts.map((a) => (hits.includes(a) ? { ...a, notifiedAt: bestPriceOf(a.id) } : a));
}

const locale = () => (currentLang() === "en" ? "en-GB" : "fr-FR");
const eur = (n: number) => {
  const v = n.toLocaleString(locale(), { maximumFractionDigits: n % 1 ? 2 : 0, minimumFractionDigits: n % 1 ? 2 : 0 });
  return currentLang() === "en" ? `€${v}` : `${v} €`;
};
