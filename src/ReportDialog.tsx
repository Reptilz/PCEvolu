// Fenêtre « Signaler une erreur » : ouverte depuis n'importe quel bouton ReportButton (événement pcevolu:report).

import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { mailReport, REPORT_KINDS, sendReport, type ReportContext, type ReportForm, type ReportKind } from "./report";

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
      <div className="sheet report-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Signaler une erreur">
        <div className="sheet-head">
          <div>
            <div className="cat">Signaler une erreur</div>
            <h2 className="sheet-title">{ctx.topic.charAt(0).toUpperCase() + ctx.topic.slice(1)}</h2>
          </div>
          <button className="icon-btn" onClick={close} aria-label="Fermer">
            <Icon name="cross" />
          </button>
        </div>

        {status === "sent" ? (
          <div className="report-done">
            <Icon name="check" />
            <div>
              <b>Merci, c'est envoyé.</b>
              <p className="muted">
                Chaque signalement est vérifié et la correction arrive avec une prochaine mise à jour des données.
                {email.trim() ? " On te répondra à l'adresse indiquée." : ""}
              </p>
            </div>
            <button className="btn primary" onClick={close}>
              Fermer
            </button>
          </div>
        ) : (
          <form className="report-form" onSubmit={submit}>
            <fieldset className="report-kinds">
              <legend>Ça concerne</legend>
              {REPORT_KINDS.map((k) => (
                <label key={k.id} className={kind === k.id ? "on" : ""}>
                  <input type="radio" name="kind" value={k.id} checked={kind === k.id} onChange={() => setKind(k.id)} />
                  {k.label}
                </label>
              ))}
            </fieldset>

            <label className="report-field">
              <span>Qu'est-ce qui est faux ?</span>
              <textarea
                ref={first}
                rows={4}
                required
                maxLength={3000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Exemple : la carte mère proposée n'a qu'un seul port M.2, pas deux."
              />
            </label>

            <label className="report-field">
              <span>
                La bonne information <em>(facultatif)</em>
              </span>
              <input
                type="text"
                maxLength={500}
                value={correct}
                onChange={(e) => setCorrect(e.target.value)}
                placeholder="Lien vers la fiche du fabricant ou du marchand, bon prix…"
              />
            </label>

            <label className="report-field">
              <span>
                Ton email, pour qu'on te réponde <em>(facultatif)</em>
              </span>
              <input type="email" maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nom@exemple.fr" />
            </label>

            {!!(ctx.details?.length || pc?.length) && (
              <div className="report-context">
                <label className="report-check">
                  <input type="checkbox" checked={withContext} onChange={(e) => setWithContext(e.target.checked)} />
                  Joindre ces informations, pour retrouver l'erreur plus vite
                </label>
                {withContext && (
                  <>
                    {!!ctx.details?.length && (
                      <>
                        <div className="report-ctx-h">Ce que l'app affichait</div>
                        <ul>
                          {ctx.details.map((d, i) => (
                            <li key={i}>{d}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    {!!pc?.length && (
                      <>
                        <div className="report-ctx-h">Ton PC</div>
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
                L'envoi n'a pas abouti (connexion internet ?). Tu peux réessayer, ou{" "}
                <button type="button" className="link" onClick={() => mailReport(form)}>
                  l'envoyer depuis ta messagerie
                </button>
                .
              </p>
            )}

            <div className="report-actions">
              <button type="button" className="btn ghost" onClick={close}>
                Annuler
              </button>
              <button type="submit" className="btn primary" disabled={!message.trim() || status === "sending"}>
                {status === "sending" ? "Envoi…" : "Envoyer"}
              </button>
            </div>
            <p className="muted small">
              Seul ce qui est affiché ici est envoyé. Ton email, si tu le donnes, sert uniquement à te répondre.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
