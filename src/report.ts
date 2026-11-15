// Signalement d'une erreur par email : ouvre la messagerie de l'utilisateur avec un message pré-rempli.
// Rien n'est envoyé sans son action : il relit le message, le complète et l'envoie lui-même.

import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "./platform";

/** Adresse qui reçoit les signalements. */
export const REPORT_EMAIL = "jmorlet94@gmail.com";

export interface ReportContext {
  /** Sujet court : « Prix de Radeon RX 7800 XT », « Page Mon plan »… */
  topic: string;
  /** Lignes de contexte ajoutées sous la question (composant, prix, page…). */
  details?: string[];
}

async function appVersion(): Promise<string> {
  if (!isTauri()) return "démo navigateur";
  try {
    const { getVersion } = await import("@tauri-apps/api/app");
    return await getVersion();
  } catch {
    return "inconnue";
  }
}

export async function reportProblem({ topic, details = [] }: ReportContext) {
  const body = [
    "Qu'est-ce qui est faux, et quelle serait la bonne information (lien vers la fiche du fabricant ou du marchand si possible) ?",
    "",
    "",
    "",
    "— Contexte ajouté par PCEvolu (tu peux le modifier ou le supprimer) —",
    ...details,
    `Version de PCEvolu : ${await appVersion()}`,
  ].join("\n");
  const url = `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(`PCEvolu : erreur signalée (${topic})`)}&body=${encodeURIComponent(body)}`;
  await openUrl(url);
}
