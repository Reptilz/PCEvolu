// Page « Ma sélection » : les pièces choisies par l'utilisateur, revérifiées ensemble comme une config
// complète, avec tout ce qu'il faut adapter (alimentation, carte mère, RAM, ventirad, boîtier…).

import type { Report } from "../types";
import type { Category, CpuSpec, Proposal } from "./types";
import type { Profile } from "./profile";
import { fluidity, isGaming, type Goal, type Verdict } from "./goal";
import { planFromChoice } from "./optimizer";
import { price } from "./engine";
import { useSelection, type SlotCategory } from "./selection";
import { KindIcons, PlanDetail, kindLabel } from "./PlanView";
import { PriceNotice } from "./PriceSheet";

const SLOTS: { slot: SlotCategory; label: string; add: string }[] = [
  { slot: "gpu", label: "Carte graphique", add: "une carte graphique" },
  { slot: "cpu", label: "Processeur", add: "un processeur" },
  { slot: "ram", label: "Mémoire vive", add: "de la mémoire" },
  { slot: "storage", label: "Stockage", add: "du stockage" },
];

export function SelectionView({ proposals, report, profile, goal, verdict, onBrowse, onPlan }: {
  proposals: Record<Category, Proposal[]>;
  report: Report;
  profile: Profile;
  goal: Goal;
  verdict: Verdict;
  onBrowse: (tab?: string) => void;
  onPlan: () => void;
}) {
  const { selection, add, remove, clear } = useSelection();

  // Les choix enregistrés sont retrouvés parmi les propositions du moment (prix et compatibilité à jour).
  const choice: Partial<Record<Category, Proposal>> = {};
  const lost: SlotCategory[] = [];
  for (const { slot } of SLOTS) {
    const id = selection[slot];
    if (!id) continue;
    const found = proposals[slot].find((x) => x.id === id);
    if (found) choice[slot] = found;
    else lost.push(slot);
  }
  const count = Object.keys(choice).length;

  if (count === 0) {
    return (
      <div className="sel-page">
        <Header />
        <div className="sel-empty">
          <p className="sel-empty-title">Ta sélection est vide</p>
          <p className="muted">
            Choisis un plan tout prêt dans Mon plan, ou ajoute des pièces une par une depuis Toutes les pièces. PCEvolu les vérifie ensemble avec ton PC
            et ajoute ce qu'il faut adapter.
          </p>
          {lost.length > 0 && <p className="muted small">Certaines pièces choisies ne sont plus proposées (catalogue mis à jour) : elles ont été retirées.</p>}
          <div className="sel-empty-actions">
            <button className="btn primary" onClick={onPlan}>
              Choisir un plan
            </button>
            <button className="btn" onClick={() => onBrowse()}>
              Parcourir toutes les pièces
            </button>
          </div>
        </div>
      </div>
    );
  }

  const plan = planFromChoice(goal, profile, report, choice);
  const ev = plan.evaluation;
  const before = verdict.fps?.fps;
  const gaming = isGaming(goal.usage) && ev.fps != null;
  // Ce qui empêche d'atteindre l'objectif même avec assez d'images par seconde (mêmes critères que le diagnostic).
  const platformRam = choice.cpu?.additions.find((a) => a.part.kind === "ram")?.part;
  const ramKit = (platformRam ?? choice.ram?.main) as { sticks?: number; gbPerStick?: number } | undefined;
  const dual = platformRam ? (ramKit?.sticks ?? 0) >= 2 : choice.ram ? true : profile.ramModules >= 2;
  const ramGb = platformRam ? (ramKit!.sticks ?? 0) * (ramKit!.gbPerStick ?? 0) : profile.ramTotalGb + (choice.ram && choice.ram.id.startsWith("ram-add") && choice.ram.main.kind === "ram" ? choice.ram.main.sticks * choice.ram.main.gbPerStick : 0);
  const gpuAfter = (choice.gpu?.main ?? profile.gpu) as { vramGb?: number } | undefined;
  const missing: string[] = [];
  if (!dual) missing.push("une 2e barrette de RAM (dual channel)");
  if (ramGb < 16) missing.push("au moins 16 Go de RAM");
  if (gpuAfter?.vramGb != null && gpuAfter.vramGb <= 8 && goal.resolution !== "1080p") missing.push("plus de mémoire vidéo pour cette résolution");
  if (!report.disks.some((d) => d.media === "SSD") && !(choice.storage?.main.kind === "ssd" && choice.storage.main.iface !== "HDD")) missing.push("un SSD");
  // Carte graphique choisie sans processeur : si le processeur actuel la bride, on propose celui qui va avec.
  const pairing = choice.gpu && !choice.cpu ? choice.gpu.pairing : undefined;
  const pairCpu = pairing ? proposals.cpu.find((x) => x.main.id === pairing.cpu.id) : undefined;

  return (
    <div className="sel-page">
      <Header />

      <section className="answer sel-answer">
        <h2 className="answer-title">
          Ta sélection : {plan.cost} €{plan.costIfVerify > plan.cost ? ` (jusqu'à ${plan.costIfVerify} € selon les points à vérifier)` : ""}
        </h2>
        {gaming ? (
          <p className="answer-sub">
            Avec ces pièces : <b>{fluidity(ev.fps!).toLowerCase()}</b> (≈ {ev.fps} i/s{before != null ? ` au lieu de ${before}` : ""}),{" "}
            {ev.reached
              ? "ton objectif est atteint."
              : ev.fps! >= goal.fps
                ? missing.length ? `assez d'images par seconde pour ton objectif, mais il reste à régler : ${missing.join(", ")}.` : "assez d'images par seconde pour ton objectif ; un point reste à régler, voir le détail."
                : `sous ton objectif de ${goal.fps} i/s, limité par ${ev.limit === "cpu" ? "le processeur" : "la carte graphique"}.`}
            {!ev.reached && missing.some((m) => m.includes("barrette")) && !choice.ram && (
              <>
                {" "}
                <button className="link" onClick={() => onBrowse("ram")}>
                  Ajouter de la mémoire
                </button>
              </>
            )}
          </p>
        ) : (
          <p className="answer-sub">Les pièces choisies, tout ce qu'il faut adapter et la compatibilité de l'ensemble sont détaillés ci-dessous.</p>
        )}
      </section>

      <h3 className="imp-h">Tes choix</h3>
      <ul className="sel-list">
        {SLOTS.map(({ slot, label, add: addLabel }) => {
          const it = choice[slot];
          if (!it) {
            return (
              <li key={slot} className="sel-item empty">
                <span className="sel-kind">{label}</span>
                <span className="muted">Inchangé</span>
                <button className="link small" onClick={() => onBrowse(slot)}>
                  Ajouter {addLabel}
                </button>
              </li>
            );
          }
          const board = it.additions.find((a) => a.role === "required" && a.part.kind === "board");
          return (
            <li key={slot} className="sel-item">
              <span className="sel-kind">{label}</span>
              <span className="sel-name">
                <KindIcons parts={[it.main]} />
                {it.main.name}
                {board && <span className="muted small"> (avec une {kindLabel(board.part).toLowerCase()} {board.part.name.replace(/^Carte mère /, "")})</span>}
              </span>
              <span className="num sel-price">{price(it.main) * it.mainQuantity} €</span>
              <span className="sel-actions">
                <button className="link small" onClick={() => onBrowse(slot)}>
                  Changer
                </button>
                <button className="link small sel-remove" onClick={() => remove(slot)}>
                  Retirer
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      {lost.length > 0 && <p className="muted small">Une pièce choisie n'est plus proposée (catalogue ou prix mis à jour) : elle a été retirée de la sélection.</p>}

      {pairing && pairCpu && (
        <section className="pairing sel-pairing">
          <h4 className="pairing-title">Ton processeur bride la carte graphique choisie</h4>
          <p className="pairing-text">
            Elle tournerait à ≈ {pairing.usedBefore} % de sa puissance. Avec un <b>{(pairCpu.main as CpuSpec).name.replace(/^(AMD|Intel) /, "")}</b>
            {pairing.parts.length ? " et ce qu'il demande" : ""}, ≈ {pairing.usedAfter} %, pour {pairing.extra} € de plus.
          </p>
          <button className="btn" onClick={() => add(pairCpu)}>
            Ajouter ce processeur à ma sélection
          </button>
        </section>
      )}

      <h3 className="imp-h sel-detail-title">Le détail, avec tout ce qu'il faut adapter</h3>
      <div className="sel-detail">
        <PlanDetail plan={plan} goal={goal} currentFps={before} onDetails={(t) => onBrowse(t)} selectable={false} />
      </div>

      <p className="sel-clear">
        <button className="link small" onClick={clear}>
          Vider ma sélection
        </button>
      </p>
      <PriceNotice />
    </div>
  );
}

function Header() {
  return (
    <header className="gp-head">
      <div>
        <h1>Ma sélection</h1>
        <p className="gp-goal">Les pièces que tu as choisies, vérifiées ensemble avec ton PC, et tout ce qu'il faut adapter.</p>
      </div>
    </header>
  );
}
