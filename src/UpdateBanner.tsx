// Bannière « Nouvelle version disponible » : vérifie les Releases GitHub au lancement (app de bureau seulement),
// télécharge la mise à jour signée, l'installe et relance PCEvolu.

import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import type { Update } from "@tauri-apps/plugin-updater";
import { Icon } from "./icons";

type State =
  | { kind: "idle" }
  | { kind: "available"; update: Update }
  | { kind: "downloading"; update: Update; percent?: number }
  | { kind: "error"; update: Update; message: string };

export function UpdateBanner() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    // Petite attente : l'analyse du PC passe d'abord.
    const t = setTimeout(async () => {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        if (alive && update) setState({ kind: "available", update });
      } catch {
        /* hors ligne ou aucune version publiée : on réessaiera au prochain lancement */
      }
    }, 4000);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, []);

  if (state.kind === "idle" || hidden) return null;
  const { update } = state;

  const install = async () => {
    let total = 0;
    let done = 0;
    setState({ kind: "downloading", update });
    try {
      await update.downloadAndInstall((e) => {
        if (e.event === "Started") total = e.data.contentLength ?? 0;
        if (e.event === "Progress") {
          done += e.data.chunkLength;
          if (total) setState({ kind: "downloading", update, percent: Math.min(100, Math.round((done / total) * 100)) });
        }
      });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (e) {
      setState({ kind: "error", update, message: String(e) });
    }
  };

  return (
    <div className={`update-banner ${state.kind}`} role="status">
      <Icon name={state.kind === "error" ? "alert" : "up"} />
      <div className="update-text">
        {state.kind === "available" && (
          <>
            <b>PCEvolu {update.version} est disponible.</b> La mise à jour prend quelques secondes, puis l'app redémarre.
          </>
        )}
        {state.kind === "downloading" && (
          <>
            <b>Mise à jour vers {update.version}…</b> {state.percent != null ? `${state.percent} %` : "Téléchargement"}
            <span className="update-bar">
              <i style={{ width: `${state.percent ?? 5}%` }} />
            </span>
          </>
        )}
        {state.kind === "error" && (
          <>
            <b>La mise à jour n'a pas abouti.</b> Vérifie ta connexion et réessaie.
          </>
        )}
      </div>
      {state.kind !== "downloading" && (
        <>
          <button className="btn primary sm" onClick={install}>
            {state.kind === "error" ? "Réessayer" : "Mettre à jour"}
          </button>
          <button className="icon-btn" onClick={() => setHidden(true)} aria-label="Plus tard">
            <Icon name="cross" />
          </button>
        </>
      )}
    </div>
  );
}
