// Bannière « Nouvelle version disponible » : vérifie les Releases GitHub au lancement (app de bureau seulement),
// télécharge la mise à jour signée, l'installe et relance PCEvolu.

import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import type { Update } from "@tauri-apps/plugin-updater";
import { Icon } from "./icons";
import { loadSettings, tr } from "./settings";

/** Cherche une nouvelle version publiée. null : à jour. Lève une erreur si hors ligne. */
export async function checkUpdate(): Promise<Update | null> {
  if (!isTauri()) return null;
  const { check } = await import("@tauri-apps/plugin-updater");
  return check();
}

/** Télécharge et installe la mise à jour signée, puis relance PCEvolu. onProgress reçoit un pourcentage. */
export async function installUpdate(update: Update, onProgress: (percent: number) => void) {
  let total = 0;
  let done = 0;
  await update.downloadAndInstall((e) => {
    if (e.event === "Started") total = e.data.contentLength ?? 0;
    if (e.event === "Progress") {
      done += e.data.chunkLength;
      if (total) onProgress(Math.min(100, Math.round((done / total) * 100)));
    }
  });
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}

type State =
  | { kind: "idle" }
  | { kind: "available"; update: Update }
  | { kind: "downloading"; update: Update; percent?: number }
  | { kind: "error"; update: Update; message: string };

export function UpdateBanner() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    // Mise à jour trouvée depuis Paramètres > Mises à jour.
    const onFound = (e: Event) => {
      setHidden(false);
      setState({ kind: "available", update: (e as CustomEvent<Update>).detail });
    };
    window.addEventListener("pcevolu:update", onFound);
    if (!isTauri() || !loadSettings().autoUpdate) return () => window.removeEventListener("pcevolu:update", onFound);
    let alive = true;
    // Petite attente : l'analyse du PC passe d'abord.
    const t = setTimeout(async () => {
      const update = await checkUpdate().catch(() => null);
      if (alive && update) setState({ kind: "available", update });
    }, 4000);
    return () => {
      alive = false;
      clearTimeout(t);
      window.removeEventListener("pcevolu:update", onFound);
    };
  }, []);

  if (state.kind === "idle" || hidden) return null;
  const { update } = state;

  const install = async () => {
    setState({ kind: "downloading", update });
    try {
      await installUpdate(update, (percent) => setState({ kind: "downloading", update, percent }));
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
            <b>{tr(`PCEvolu ${update.version} est disponible.`, `PCEvolu ${update.version} is available.`)}</b>{" "}
            {tr("La mise à jour prend quelques secondes, puis l'app redémarre.", "Updating takes a few seconds, then the app restarts.")}
          </>
        )}
        {state.kind === "downloading" && (
          <>
            <b>{tr(`Mise à jour vers ${update.version}…`, `Updating to ${update.version}…`)}</b> {state.percent != null ? `${state.percent} %` : tr("Téléchargement", "Downloading")}
            <span className="update-bar">
              <i style={{ width: `${state.percent ?? 5}%` }} />
            </span>
          </>
        )}
        {state.kind === "error" && (
          <>
            <b>{tr("La mise à jour n'a pas abouti.", "The update failed.")}</b> {tr("Vérifie ta connexion et réessaie.", "Check your connection and try again.")}
          </>
        )}
      </div>
      {state.kind !== "downloading" && (
        <>
          <button className="btn primary sm" onClick={install}>
            {state.kind === "error" ? tr("Réessayer", "Try again") : tr("Mettre à jour", "Update")}
          </button>
          <button className="icon-btn" onClick={() => setHidden(true)} aria-label={tr("Plus tard", "Later")}>
            <Icon name="cross" />
          </button>
        </>
      )}
    </div>
  );
}
