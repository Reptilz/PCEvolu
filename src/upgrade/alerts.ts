// Alertes de prix : « préviens-moi quand ce composant passe sous X € ».
// Vérifiées à chaque ouverture de l'app, quand les nouveaux prix sont chargés (relevé hebdomadaire).

import { priceInfo } from "./prices";
import { notify } from "../platform";

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
    await notify("Baisse de prix 📉", `${a.name} est à ${eur(bestPriceOf(a.id)!)} (ton seuil : ${eur(a.target)}).`);
  } else {
    await notify("Baisses de prix 📉", `${hits.length} composants que tu surveilles sont passés sous ton seuil : ${hits.map((h) => h.name).join(", ")}.`);
  }
  return alerts.map((a) => (hits.includes(a) ? { ...a, notifiedAt: bestPriceOf(a.id) } : a));
}

const eur = (n: number) => `${n.toLocaleString("fr-FR", { maximumFractionDigits: n % 1 ? 2 : 0, minimumFractionDigits: n % 1 ? 2 : 0 })} €`;
