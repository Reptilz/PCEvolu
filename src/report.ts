// Signalement d'une erreur : formulaire dans l'app, envoyé par Web3Forms qui le transmet par email.
// Repli : si l'envoi échoue (hors ligne, service indisponible), la messagerie de l'utilisateur s'ouvre avec le message.

import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "./platform";
import type { Report } from "./types";
import { currentLang, tr } from "./settings";

/** Clé d'accès Web3Forms : publique par conception (elle permet seulement d'envoyer vers l'adresse liée). */
export const WEB3FORMS_KEY = "f8ee8f5b-ff4d-4e69-a0d3-e096c4f70e9f";
/** Adresse de repli, utilisée seulement si l'envoi par le formulaire échoue. */
export const REPORT_EMAIL = "jmorlet94@gmail.com";

export type ReportKind = "prix" | "compatibilite" | "composant" | "autre";
/** label : français (repris tel quel dans l'email envoyé au développeur) ; labelEn : affiché dans le formulaire en anglais. */
export const REPORT_KINDS: { id: ReportKind; label: string; labelEn: string }[] = [
  { id: "prix", label: "Un prix ou une offre", labelEn: "A price or an offer" },
  { id: "compatibilite", label: "Une compatibilité ou un conseil", labelEn: "Compatibility or advice" },
  { id: "composant", label: "Un composant mal détecté", labelEn: "A part detected wrongly" },
  { id: "autre", label: "Autre chose", labelEn: "Something else" },
];
/** Libellé d'un type de signalement dans la langue de l'utilisateur (à appeler à l'affichage). */
export const reportKindLabel = (k: { label: string; labelEn: string }) => tr(k.label, k.labelEn);

export interface ReportContext {
  /** Sujet court : « prix de Radeon RX 7800 XT », « page Mon plan »… */
  topic: string;
  /** Type proposé par défaut dans le formulaire. */
  kind?: ReportKind;
  /** Lignes de contexte jointes au signalement (composant, prix, page…), visibles par l'utilisateur. */
  details?: string[];
}

export interface ReportForm extends ReportContext {
  kind: ReportKind;
  message: string;
  correct?: string;
  email?: string;
  withContext: boolean;
  /** Fiche du PC (pcSummary), jointe avec le contexte. */
  pc?: string[];
}

/** Ouvre la fenêtre de signalement (écoutée par <ReportDialog />). */
export function openReport(ctx: ReportContext) {
  window.dispatchEvent(new CustomEvent<ReportContext>("pcevolu:report", { detail: ctx }));
}

export async function appVersion(): Promise<string> {
  if (!isTauri()) return "démo navigateur";
  try {
    const { getVersion } = await import("@tauri-apps/api/app");
    return await getVersion();
  } catch {
    return "inconnue";
  }
}

/** Fiche du PC jointe aux signalements : de quoi reproduire une erreur de compatibilité ou de détection. */
export function pcSummary(r?: Report): string[] {
  if (!r) return [];
  const gb = (b?: number) => (b ? `${Math.round(b / 1024 ** 3)} Go` : "?");
  const join = (...xs: (string | number | undefined | false)[]) => xs.filter(Boolean).join(" ");
  const out: string[] = [];
  out.push(`Windows : ${join(r.os.name, r.os.version, r.os.build && `(build ${r.os.build})`, r.os.architecture)}`);
  if (r.system.manufacturer || r.system.model) out.push(`PC : ${join(r.system.manufacturer, r.system.model, r.system.isLaptop && "(portable)")}`);
  out.push(`Carte mère : ${join(r.board.manufacturer, r.board.product) || "?"}${r.board.biosVersion ? `, BIOS ${r.board.biosVersion}${r.board.biosDate ? ` du ${r.board.biosDate}` : ""}` : ""}`);
  for (const c of r.cpus) out.push(`Processeur : ${c.name ?? "?"}${c.cores ? `, ${c.cores} cœurs / ${c.threads ?? "?"} threads` : ""}${c.socket ? `, socket ${c.socket}` : ""}`);
  for (const g of r.gpus) out.push(`Carte graphique : ${g.name ?? "?"}${g.vramBytes ? `, ${gb(g.vramBytes)}` : ""}${g.driverVersion ? `, pilote ${g.driverVersion}` : ""}`);
  const m = r.memory;
  const mod = m.modules[0];
  out.push(
    `Mémoire : ${gb(m.totalBytes)} en ${m.modules.length} barrette${m.modules.length > 1 ? "s" : ""}${m.slotsTotal ? ` sur ${m.slotsTotal} emplacements` : ""}` +
      `${mod?.kind ? `, ${mod.kind}` : ""}${mod?.speedMts ? ` ${mod.speedMts} MT/s` : ""}${mod?.configuredMts && mod.configuredMts !== mod.speedMts ? ` (réglée à ${mod.configuredMts})` : ""}`,
  );
  for (const d of r.disks) out.push(`Disque : ${d.name ?? "?"}, ${d.media} ${d.bus}, ${gb(d.sizeBytes)}`);
  for (const d of r.displays) out.push(`Écran : ${d.width} × ${d.height}, ${d.currentHz} Hz (max ${d.maxHz} Hz)${d.primary ? ", principal" : ""}`);
  return out;
}

async function compose(f: ReportForm) {
  const kind = REPORT_KINDS.find((k) => k.id === f.kind)?.label ?? f.kind;
  const version = await appVersion();
  const context = f.withContext ? [...(f.details ?? [])] : [];
  const pc = f.withContext ? (f.pc ?? []) : [];
  const subject = `PCEvolu : erreur signalée (${f.topic})`;
  // Champs séparés : Web3Forms affiche chacun comme une section titrée de l'email.
  const fields: Record<string, string> = {
    "Type de problème": kind,
    "Endroit dans l'app": f.topic,
    "Ce qui est faux": f.message.trim(),
    ...(f.correct?.trim() ? { "La bonne information": f.correct.trim() } : {}),
    ...(context.length ? { "Ce que l'app affichait": context.join("\n") } : {}),
    ...(pc.length ? { "Le PC de l'utilisateur": pc.join("\n") } : {}),
    "Email pour répondre": f.email?.trim() || "Non renseigné (pas de réponse souhaitée)",
    "Version de PCEvolu": version,
    "Langue de l'utilisateur": currentLang() === "en" ? "English" : "Français",
  };
  const body = Object.entries(fields)
    .map(([k, v]) => `${k} :\n${v}`)
    .join("\n\n");
  return { subject, fields, body };
}

let sending = false;

/** Envoie le signalement. Renvoie false si l'envoi a échoué (le repli par email est alors proposé). */
export async function sendReport(f: ReportForm): Promise<boolean> {
  if (!WEB3FORMS_KEY) return false;
  if (sending) return true; // double clic : le premier envoi est déjà en cours
  sending = true;
  const { subject, fields } = await compose(f);
  try {
    const res = await fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        access_key: WEB3FORMS_KEY,
        subject,
        from_name: "PCEvolu",
        ...fields,
        // « Répondre » dans la messagerie écrit directement à l'utilisateur (la section « Email pour répondre » affiche l'adresse).
        ...(f.email?.trim() ? { replyto: f.email.trim() } : {}),
        botcheck: false,
      }),
    });
    const json = await res.json().catch(() => ({}));
    return res.ok && json.success !== false;
  } catch {
    return false;
  } finally {
    sending = false;
  }
}

/** Repli : ouvre la messagerie avec le même message pré-rempli. */
export async function mailReport(f: ReportForm) {
  const { subject, body } = await compose(f);
  await openUrl(`mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
}
