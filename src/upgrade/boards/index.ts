// Base de cartes mères réelles, relevée sur les fiches et listes de processeurs des fabricants (MSI, ASUS, Gigabyte, ASRock),
// novembre 2026. Pour chaque carte : emplacements RAM et M.2, port graphique, partages de lignes, et premier BIOS
// qui accepte chaque famille de processeurs.
//
// Règles de prudence appliquées à la conversion :
// - un BIOS minimum daté avant la sortie du processeur visé (fréquent dans les listes des fabricants pour les X3D)
//   est écarté : l'app conseille alors de vérifier plutôt que d'affirmer ;
// - les champs que la fiche ne donnait pas restent vides : l'app retombe sur ce que Windows lit ou sur le chipset.

import type { BiosFamily, BoardSpec, FormFactor, RamType, Socket } from "../types";
import am4 from "./am4.json";
import am5 from "./am5.json";
import intel from "./intel.json";
import { SHARING_FR } from "./sharing-fr";

interface RawBios {
  version: string;
  date?: string | null;
}
interface RawBoard {
  name: string;
  wmi: string | null;
  vendor: string;
  chipset: string;
  formFactor: string;
  ramType: string;
  ramSlots: number | null;
  maxRamGb: number | null;
  m2: (number | null)[];
  pcieGpu: number | null;
  sata: number | null;
  sharing: string[];
  biosFlashback?: boolean;
  biosMin: Record<string, RawBios | null>;
  source: string | null;
}

const FAMILY: Record<string, BiosFamily[]> = {
  zen1: ["amd-zen1", "amd-zen1plus"],
  zen2: ["amd-zen2"],
  zen3: ["amd-zen3"],
  zen3x3d: ["amd-zen3-x3d"],
  zen3x3d_5700x3d: ["amd-zen3-x3d-5700"],
  zen4: ["amd-zen4"],
  zen4apu: ["amd-zen4-apu"],
  zen5: ["amd-zen5"],
  zen5x3d: ["amd-zen5-x3d"],
  "intel-11": ["intel-11"],
  "intel-12": ["intel-12"],
  "intel-13": ["intel-13"],
  "intel-14": ["intel-14"],
};

/** Sortie des processeurs X3D : un BIOS « compatible » daté bien avant n'est pas crédible. */
const NOT_BEFORE: Partial<Record<BiosFamily, string>> = {
  "amd-zen3-x3d": "2022-01-01",
  "amd-zen3-x3d-5700": "2023-06-01",
  "amd-zen5-x3d": "2024-10-01",
};

const SOCKET: Record<string, Socket> = {
  A320: "AM4", B350: "AM4", X370: "AM4", B450: "AM4", X470: "AM4", A520: "AM4", B550: "AM4", X570: "AM4",
  A620: "AM5", B650: "AM5", B650E: "AM5", X670: "AM5", X670E: "AM5", B840: "AM5", B850: "AM5", X870: "AM5", X870E: "AM5",
  H410: "LGA1200", B460: "LGA1200", H470: "LGA1200", Z490: "LGA1200", H510: "LGA1200", B560: "LGA1200", H570: "LGA1200", Z590: "LGA1200",
  H610: "LGA1700", B660: "LGA1700", H670: "LGA1700", Z690: "LGA1700", B760: "LGA1700", H770: "LGA1700", Z790: "LGA1700",
  H810: "LGA1851", B860: "LGA1851", Z890: "LGA1851",
};

/** Nom comparable : majuscules, sans le code MSI « (MS-7C81) », sans espaces ni ponctuation. */
export const boardKey = (s: string) => s.toUpperCase().replace(/\(MS-[0-9A-Z]+\)/, "").replace(/[^A-Z0-9]/g, "");

/** Notes de partage en français (traduction écrite à la main, voir sharing-fr.ts). */
const fr = (note: string) => SHARING_FR[note] ?? note;

function convert(r: RawBoard): BoardSpec | undefined {
  const socket = SOCKET[r.chipset];
  if (!socket) return undefined;
  const biosMin: BoardSpec["biosMin"] = {};
  for (const [key, v] of Object.entries(r.biosMin)) {
    for (const fam of FAMILY[key] ?? []) {
      if (v === null) {
        biosMin[fam] = null;
        continue;
      }
      const floor = NOT_BEFORE[fam];
      if (floor && v.date && v.date < floor) continue; // date antérieure à la sortie du processeur : non crédible
      biosMin[fam] = { version: v.version, date: v.date ?? "" };
    }
  }
  const m2 = r.m2.filter((g): g is number => typeof g === "number");
  const name = r.name.replace(/\s*\((rev\.?|DDR5,).*?\)$/i, "");
  return {
    kind: "board",
    id: `db-${boardKey(r.name).toLowerCase()}`,
    name,
    socket,
    chipset: r.chipset,
    formFactor: (r.formFactor as FormFactor) ?? "ATX",
    ramType: r.ramType as RamType,
    ramSlots: r.ramSlots ?? 0,
    maxRamGb: r.maxRamGb ?? 0,
    m2Slots: r.m2.length,
    m2Gens: m2.length === r.m2.length && m2.length ? m2 : undefined,
    pcieGpu: (r.pcieGpu as 3 | 4 | 5) ?? (0 as 3),
    sata: r.sata ?? undefined,
    sharing: r.sharing.map(fr),
    biosFlashback: r.biosFlashback,
    biosMin,
    source: r.source ?? undefined,
    availability: null,
    // Windows donne le nom du modèle (MSI y ajoute son code « MS-7C81 ») : on compare les noms normalisés.
    match: undefined,
    note: undefined,
    wmiKey: boardKey(r.wmi ?? r.name.replace(/^(MSI|ASUS|Gigabyte|GIGABYTE|ASRock)\s+/i, "").replace(/\s*\(.*\)$/, "")),
  } as BoardSpec & { wmiKey: string };
}

export const KNOWN_BOARDS = ([...am4, ...am5, ...intel] as RawBoard[])
  .map(convert)
  .filter((b): b is BoardSpec & { wmiKey: string } => !!b);

/** Carte mère réelle reconnue à partir du nom donné par Windows (Win32_BaseBoard.Product). */
export function findKnownBoard(product?: string): BoardSpec | undefined {
  if (!product) return undefined;
  const k = boardKey(product);
  return KNOWN_BOARDS.find((b) => b.wmiKey === k);
}
