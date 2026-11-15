// Fenêtre « Signaler une erreur » : ouverte depuis n'importe quel bouton ReportButton (événement pcevolu:report).

import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { mailReport, REPORT_KINDS, reportKindLabel, sendReport, type ReportContext, type ReportForm, type ReportKind } from "./report";
import { tr } from "./settings";

type Status = "editing" | "sending" | "sent" | "failed";

export function ReportDialog({ pc }: { pc?: string[] }) {
  const [ctx, setCtx] = useState<ReportContext>();
  const [kind, setKind] = useState<ReportKind>("autre");
  const [message, setMessage] = useState("");
  const [correct, setCorrect] = useState("");
  const [email, setEmail] = useState("");
  const [withContext, setWithContext] = useState(true);
  const [status, setStatus] = useState<Status>("editing");
  const first = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const c = (e as CustomEvent<ReportContext>).detail;
      setCtx(c);
      setKind(c.kind ?? "autre");
      setMessage("");
      setCorrect("");
      setWithContext(true);
      setStatus("editing");
    };
    window.addEventListener("pcevolu:report", onOpen);
    return () => window.removeEventListener("pcevolu:report", onOpen);
  }, []);

  useEffect(() => {
    if (!ctx) return;
    setTimeout(() => first.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setCtx(undefined);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ctx]);

  if (!ctx) return null;
  const form: ReportForm = { ...ctx, kind, message, correct, email, withContext, pc };
  const close = () => setCtx(undefined);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || status === "sending") return;
    setStatus("sending");
    setStatus((await sendReport(form)) ? "sent" : "failed");
  };

  return (
    <div className="sheet-backdrop" onClick={close}>
      <div className="sheet report-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={tr("Signaler une erreur", "Report a mistake")}>
        <div className="sheet-head">
          <div>
            <div className="cat">{tr("Signaler une erreur", "Report a mistake")}</div>
            <h2 className="sheet-title">{ctx.topic.charAt(0).toUpperCase() + ctx.topic.slice(1)}</h2>
          </div>
          <button className="icon-btn" onClick={close} aria-label={tr("Fermer", "Close")}>
            <Icon name="cross" />
          </button>
        </div>

        {status === "sent" ? (
          <div className="report-done">
            <Icon name="check" />
            <div>
              <b>{tr("Merci, c'est envoyé.", "Thanks, it's been sent.")}</b>
              <p className="muted">
                {tr(
                  "Chaque signalement est vérifié et la correction arrive avec une prochaine mise à jour des données.",
                  "Every report is checked and the fix comes with an upcoming data update.",
                )}
                {email.trim() ? tr(" On te répondra à l'adresse indiquée.", " We'll reply to the address you gave.") : ""}
              </p>
            </div>
            <button className="btn primary" onClick={close}>
              {tr("Fermer", "Close")}
            </button>
          </div>
        ) : (
          <form className="report-form" onSubmit={submit}>
            <fieldset className="report-kinds">
              <legend>{tr("Ça concerne", "It's about")}</legend>
              {REPORT_KINDS.map((k) => (
                <label key={k.id} className={kind === k.id ? "on" : ""}>
                  <input type="radio" name="kind" value={k.id} checked={kind === k.id} onChange={() => setKind(k.id)} />
                  {reportKindLabel(k)}
                </label>
              ))}
            </fieldset>

            <label className="report-field">
              <span>{tr("Qu'est-ce qui est faux ?", "What's wrong?")}</span>
              <textarea
                ref={first}
                rows={4}
                required
                maxLength={3000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={tr("Exemple : la carte mère proposée n'a qu'un seul port M.2, pas deux.", "Example: the suggested motherboard only has one M.2 slot, not two.")}
              />
            </label>

            <label className="report-field">
              <span>
                {tr("La bonne information", "The correct information")} <em>{tr("(facultatif)", "(optional)")}</em>
              </span>
              <input
                type="text"
                maxLength={500}
                value={correct}
                onChange={(e) => setCorrect(e.target.value)}
                placeholder={tr("Lien vers la fiche du fabricant ou du marchand, bon prix…", "Link to the manufacturer's or merchant's page, correct price…")}
              />
            </label>

            <label className="report-field">
              <span>
                {tr("Ton email, pour qu'on te réponde", "Your email, so we can reply")} <em>{tr("(facultatif)", "(optional)")}</em>
              </span>
              <input type="email" maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} placeholder={tr("nom@exemple.fr", "name@example.com")} />
            </label>

            {!!(ctx.details?.length || pc?.length) && (
              <div className="report-context">
                <label className="report-check">
                  <input type="checkbox" checked={withContext} onChange={(e) => setWithContext(e.target.checked)} />
                  {tr("Joindre ces informations, pour retrouver l'erreur plus vite", "Attach this information, to track down the mistake faster")}
                </label>
                {withContext && (
                  <>
                    {!!ctx.details?.length && (
                      <>
                        <div className="report-ctx-h">{tr("Ce que l'app affichait", "What the app was showing")}</div>
                        <ul>
                          {ctx.details.map((d, i) => (
                            <li key={i}>{d}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    {!!pc?.length && (
                      <>
                        <div className="report-ctx-h">{tr("Ton PC", "Your PC")}</div>
                        <ul>
                          {pc.map((d, i) => (
                            <li key={i}>{d}</li>
                          ))}
                        </ul>
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            {status === "failed" && (
              <p className="opt-error">
                {tr("L'envoi n'a pas abouti (connexion internet ?). Tu peux réessayer, ou", "Sending didn't go through (internet connection?). You can try again, or")}{" "}
                <button type="button" className="link" onClick={() => mailReport(form)}>
                  {tr("l'envoyer depuis ta messagerie", "send it from your email app")}
                </button>
                .
              </p>
            )}

            <div className="report-actions">
              <button type="button" className="btn ghost" onClick={close}>
                {tr("Annuler", "Cancel")}
              </button>
              <button type="submit" className="btn primary" disabled={!message.trim() || status === "sending"}>
                {status === "sending" ? tr("Envoi…", "Sending…") : tr("Envoyer", "Send")}
              </button>
            </div>
            <p className="muted small">
              {tr(
                "Seul ce qui est affiché ici est envoyé. Ton email, si tu le donnes, sert uniquement à te répondre.",
                "Only what's shown here is sent. Your email, if you give it, is only used to reply to you.",
              )}
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
