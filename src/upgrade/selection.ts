// « Ma sélection » : les pièces que l'utilisateur a choisies (une par catégorie), gardées sur l'ordinateur.
// Elles sont revérifiées ensemble comme une config complète (voir planFromChoice dans optimizer.ts).

import { createContext, useContext } from "react";
import type { Category, Proposal } from "./types";

/** Catégories qu'on peut choisir : l'onglet « Carte mère » remplit la case processeur (la carte vient avec). */
export type SlotCategory = "gpu" | "cpu" | "ram" | "storage";
export type Selection = Partial<Record<SlotCategory, string>>;

const KEY = "pcevolu.selection.v1";

export function loadSelection(): Selection {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Selection) : {};
  } catch {
    return {};
  }
}

export function saveSelection(s: Selection) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* stockage indisponible : la sélection reste en mémoire */
  }
}

/** Case de la sélection et identifiant à enregistrer pour une proposition (une carte mère compte comme son processeur). */
export function slotOf(p: Proposal): { slot: SlotCategory; id: string } {
  if (p.category === "board") return { slot: "cpu", id: p.sourceId ?? p.id };
  return { slot: p.category as SlotCategory, id: p.id };
}

export interface SelectionApi {
  selection: Selection;
  /** Ajoute (ou remplace dans sa catégorie) une proposition. */
  add: (p: Proposal) => void;
  remove: (slot: SlotCategory) => void;
  /** Remplace toute la sélection (« Choisir ce plan »). */
  replace: (choice: Partial<Record<Category, Proposal>>) => void;
  clear: () => void;
  /** Ouvre la page « Ma sélection ». */
  open: () => void;
}

export const SelectionContext = createContext<SelectionApi>({
  selection: {},
  add: () => {},
  remove: () => {},
  replace: () => {},
  clear: () => {},
  open: () => {},
});

export const useSelection = () => useContext(SelectionContext);
