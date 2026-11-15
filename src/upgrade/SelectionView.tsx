// Page « Ma sélection » : les pièces choisies par l'utilisateur, revérifiées ensemble comme une config
// complète, avec tout ce qu'il faut adapter (alimentation, carte mère, RAM, ventirad, boîtier…).

import type { Report } from "../types";
import type { Category, CpuSpec, Proposal } from "./types";
import type { Profile } from "./profile";
import { fluidity, isGaming, type Goal, type Verdict } from "./goal";
import { planFromChoice } from "./optimizer";
import { price } from "./engine";
import { useSelection, type SlotCategory } from "./selection";
import { KindIcons, PlanDetail, euros, kindLabel } from "./PlanView";
import { PriceNotice } from "./PriceSheet";
import { partName } from "./catalog";
import { Icon } from "../icons";
import { tr } from "../settings";

const slots = (): { slot: SlotCategory; label: string; add: string }[] => [
  { slot: "gpu", label: tr("Carte graphique", "Graphics card"), add: tr("une carte graphique", "a graphics card") },
  { slot: "cpu", label: tr("Processeur", "Processor"), add: tr("un processeur", "a processor") },
  { slot: "ram", label: tr("Mémoire vive", "RAM"), add: tr("de la mémoire", "memory") },
  { slot: "storage", label: tr("Stockage", "Storage"), add: tr("du stockage", "storage") },
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
  for (const { slot } of slots()) {
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
          <p className="sel-empty-title">{tr("Ta sélection est vide", "Your selection is empty")}</p>
          <p className="muted">
            {tr(
              "Choisis un plan tout prêt dans Mon plan, ou ajoute des pièces une par une depuis Toutes les pièces. PCEvolu les vérifie ensemble avec ton PC et ajoute ce qu'il faut adapter.",
              "Pick a ready-made plan in My plan, or add parts one by one from All parts. PCEvolu checks them together with your PC and adds whatever needs adapting.",
            )}
          </p>
          {lost.length > 0 && <p className="muted small">{tr("Certaines pièces choisies ne sont plus proposées (catalogue mis à jour) : elles ont été retirées.", "Some parts you chose are no longer offered (catalogue updated): they have been removed.")}</p>}
          <div className="sel-empty-actions">
            <button className="btn primary" onClick={onPlan}>
              {tr("Choisir un plan", "Choose a plan")}
            </button>
            <button className="btn" onClick={() => onBrowse()}>
              {tr("Parcourir toutes les pièces", "Browse all parts")}
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
  if (!dual) missing.push(tr("une 2e barrette de RAM (dual channel)", "a 2nd RAM stick (dual channel)"));
  if (ramGb < 16) missing.push(tr("au moins 16 Go de RAM", "at least 16 GB of RAM"));
  if (gpuAfter?.vramGb != null && gpuAfter.vramGb <= 8 && goal.resolution !== "1080p") missing.push(tr("plus de mémoire vidéo pour cette résolution", "more video memory for this resolution"));
  if (!report.disks.some((d) => d.media === "SSD") && !(choice.storage?.main.kind === "ssd" && choice.storage.main.iface !== "HDD")) missing.push(tr("un SSD", "an SSD"));
  // Carte graphique choisie sans processeur : si le processeur actuel la bride, on propose celui qui va avec.
  const pairing = choice.gpu && !choice.cpu ? choice.gpu.pairing : undefined;
  const pairCpu = pairing ? proposals.cpu.find((x) => x.main.id === pairing.cpu.id) : undefined;

  return (
    <div className="sel-page">
      <Header />

      <section className="answer sel-answer">
        <h2 className="answer-title">
          {tr("Ta sélection : ", "Your selection: ")}{euros(plan.cost)}
          {plan.costIfVerify > plan.cost
            ? tr(` (jusqu'à ${plan.costIfVerify} € selon les points à vérifier)`, ` (up to ${euros(plan.costIfVerify)} depending on the points to check)`)
            : ""}
        </h2>
        {gaming ? (
          <p className="answer-sub">
            {tr("Avec ces pièces : ", "With these parts: ")}<b>{fluidity(ev.fps!).toLowerCase()}</b>{" "}
            {tr(
              `(≈ ${ev.fps} i/s${before != null ? ` au lieu de ${before}` : ""}),`,
              `(≈ ${ev.fps} fps${before != null ? ` instead of ${before}` : ""}),`,
            )}{" "}
            {ev.reached
              ? tr("ton objectif est atteint.", "your goal is reached.")
              : ev.fps! >= goal.fps
                ? missing.length
                  ? tr(
                      `assez d'images par seconde pour ton objectif, mais il reste à régler : ${missing.join(", ")}.`,
                      `enough frames per second for your goal, but there's still something to sort out: ${missing.join(", ")}.`,
                    )
                  : tr(
                      "assez d'images par seconde pour ton objectif ; un point reste à régler, voir le détail.",
                      "enough frames per second for your goal; one point still needs sorting out, see the details.",
                    )
                : tr(
                    `sous ton objectif de ${goal.fps} i/s, limité par ${ev.limit === "cpu" ? "le processeur" : "la carte graphique"}.`,
                    `below your goal of ${goal.fps} fps, limited by ${ev.limit === "cpu" ? "the processor" : "the graphics card"}.`,
                  )}
            {!ev.reached && !dual && !choice.ram && (
              <>
                {" "}
                <button className="link" onClick={() => onBrowse("ram")}>
                  {tr("Ajouter de la mémoire", "Add memory")}
                </button>
              </>
            )}
          </p>
        ) : (
          <p className="answer-sub">{tr("Les pièces choisies, tout ce qu'il faut adapter et la compatibilité de l'ensemble sont détaillés ci-dessous.", "The parts you chose, everything that needs adapting and the overall compatibility are detailed below.")}</p>
        )}
      </section>

      <h3 className="imp-h">{tr("Tes choix", "Your choices")}</h3>
      <ul className="sel-list">
        {slots().map(({ slot, label, add: addLabel }) => {
          const it = choice[slot];
          if (!it) {
            return (
              <li key={slot} className="sel-item empty">
                <span className="sel-kind">{label}</span>
                <span className="muted">{tr("Inchangé", "Unchanged")}</span>
                <button className="link small" onClick={() => onBrowse(slot)}>
                  {tr(`Ajouter ${addLabel}`, `Add ${addLabel}`)}
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
                {partName(it.main)}
                {board && (
                  <span className="muted small">
                    {tr(
                      ` (avec une ${kindLabel(board.part).toLowerCase()} ${board.part.name.replace(/^Carte mère /, "")})`,
                      ` (with a ${kindLabel(board.part).toLowerCase()} ${board.part.name.replace(/^(Carte mère|Motherboard) /, "")})`,
                    )}
                  </span>
                )}
              </span>
              <span className="num sel-price">{euros(price(it.main) * it.mainQuantity)}</span>
              <span className="sel-actions">
                <button className="link small" onClick={() => onBrowse(slot)}>
                  {tr("Changer", "Change")}
                </button>
                <button className="icon-btn" onClick={() => remove(slot)} aria-label={tr(`Retirer ${it.main.name} de ma sélection`, `Remove ${it.main.name} from my selection`)} title={tr("Retirer de ma sélection", "Remove from my selection")}>
                  <Icon name="cross" />
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      {lost.length > 0 && <p className="muted small">{tr("Une pièce choisie n'est plus proposée (catalogue ou prix mis à jour) : elle a été retirée de la sélection.", "A part you chose is no longer offered (catalogue or prices updated): it has been removed from the selection.")}</p>}

      {pairing && pairCpu && (
        <section className="pairing sel-pairing">
          <h4 className="pairing-title">{tr("Ton processeur bride la carte graphique choisie", "Your processor holds back the graphics card you chose")}</h4>
          <p className="pairing-text">
            {tr(`Elle tournerait à ≈ ${pairing.usedBefore} % de sa puissance. Avec un `, `It would run at ≈ ${pairing.usedBefore}% of its power. With a `)}
            <b>{(pairCpu.main as CpuSpec).name.replace(/^(AMD|Intel) /, "")}</b>
            {pairing.parts.length ? tr(" et ce qu'il demande", " and what it needs") : ""}
            {tr(`, ≈ ${pairing.usedAfter} %, pour ${pairing.extra} € de plus.`, `, ≈ ${pairing.usedAfter}%, for ${euros(pairing.extra)} more.`)}
          </p>
          <button className="btn" onClick={() => add(pairCpu)}>
            {tr("Ajouter ce processeur à ma sélection", "Add this processor to my selection")}
          </button>
        </section>
      )}

      <h3 className="imp-h sel-detail-title">{tr("Le détail, avec tout ce qu'il faut adapter", "The details, with everything that needs adapting")}</h3>
      <div className="sel-detail">
        <PlanDetail plan={plan} goal={goal} currentFps={before} onDetails={(t) => onBrowse(t)} selectable={false} />
      </div>

      <p className="sel-clear">
        <button className="link small" onClick={clear}>
          {tr("Vider ma sélection", "Clear my selection")}
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
        <h1>{tr("Ma sélection", "My selection")}</h1>
        <p className="gp-goal">{tr("Les pièces que tu as choisies, vérifiées ensemble avec ton PC, et tout ce qu'il faut adapter.", "The parts you chose, checked together with your PC, and everything that needs adapting.")}</p>
      </div>
    </header>
  );
}
