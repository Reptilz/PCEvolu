// Lexique : les termes techniques restent dans le texte (pour les passionnés),
// avec leur explication au survol (pour tout le monde).

import { Fragment, type ReactNode } from "react";
import { tr } from "./settings";

/** Évalué à l'appel, pour suivre la langue choisie. */
const glossary = (): [RegExp, string][] => [
  [/dual[- ]channel/i, tr("Deux barrettes de RAM qui travaillent en parallèle : la mémoire va deux fois plus vite qu'avec une seule.", "Two RAM sticks working side by side: memory runs twice as fast as with a single one.")],
  [/single[- ]channel/i, tr("Une seule barrette de RAM : la mémoire va moitié moins vite qu'avec deux barrettes identiques.", "A single RAM stick: memory runs half as fast as with two identical sticks.")],
  [/\bVRAM\b|mémoire vidéo|video memory/i, tr("La mémoire propre à la carte graphique, où sont chargées les textures des jeux. Trop peu, et les jeux saccadent.", "The graphics card's own memory, where game textures are loaded. Too little, and games stutter.")],
  [/\bchipset\b/i, tr("La puce de la carte mère qui décide quels processeurs, quelle RAM et quelles options sont possibles.", "The motherboard chip that decides which processors, which RAM and which options are possible.")],
  [/\bNVMe\b/i, tr("SSD très rapide qui se branche directement sur la carte mère, sans câble (jusqu'à 10 fois plus rapide qu'un disque dur).", "A very fast SSD that plugs straight into the motherboard, with no cable (up to 10 times faster than a hard drive).")],
  [/\bM\.2\b/i, tr("Format de SSD en forme de petite barrette, vissé directement sur la carte mère.", "An SSD format shaped like a small stick, screwed directly onto the motherboard.")],
  [/\bSATA\b/i, tr("Branchement classique des disques et SSD de 2,5 pouces, avec un câble. Plus lent qu'un SSD NVMe, mais suffisant au quotidien.", "The classic connection for hard drives and 2.5-inch SSDs, with a cable. Slower than an NVMe SSD, but fine for everyday use.")],
  [/\bPCIe\b/i, tr("Le connecteur de la carte mère où se branchent la carte graphique et les SSD NVMe.", "The motherboard slot where the graphics card and NVMe SSDs plug in.")],
  [/micro[- ]ATX|\bmATX\b/i, tr("Format de carte mère compact, pour les boîtiers moyens et petits.", "A compact motherboard format, for medium and small cases.")],
  [/\bATX\b/i, tr("Le format standard de carte mère et d'alimentation, celui de la plupart des PC fixes.", "The standard motherboard and power supply format, used by most desktop PCs.")],
  [/\bsocket\b|\bLGA ?1[0-9]{3}\b|\bAM[45]\b/i, tr("L'emplacement du processeur sur la carte mère. Un processeur ne rentre que dans le socket prévu pour lui.", "The processor's slot on the motherboard. A processor only fits the socket made for it.")],
  [/\bDDR[45]\b/i, tr("La génération de RAM. DDR4 et DDR5 ne sont pas compatibles entre elles : la carte mère n'accepte que l'une des deux.", "The RAM generation. DDR4 and DDR5 are not compatible with each other: the motherboard only takes one of the two.")],
  [/\bXMP\b|\bEXPO\b/i, tr("Réglage du BIOS qui fait tourner la RAM à sa vitesse annoncée. Sans lui, elle reste bridée.", "A BIOS setting that runs the RAM at its advertised speed. Without it, the RAM stays held back.")],
  [/\bBIOS\b/i, tr("Le logiciel interne de la carte mère, qui démarre le PC avant Windows.", "The motherboard's built-in software, which starts the PC before Windows.")],
  [/\bTDP\b/i, tr("La chaleur que le composant dégage, en watts. Le refroidissement doit pouvoir l'évacuer.", "The heat the component gives off, in watts. The cooling has to be able to get rid of it.")],
  [/12V-2x6|12VHPWR|câble 16 broches|16-pin cable/i, tr("Prise d'alimentation des cartes graphiques récentes. Les alimentations plus anciennes ont besoin d'un adaptateur.", "The power connector of recent graphics cards. Older power supplies need an adapter.")],
  [/\bventirad\b|\bCPU cooler\b/i, tr("Le radiateur avec ventilateur posé sur le processeur pour le refroidir.", "The heatsink and fan sitting on the processor to cool it.")],
  [/watercooling|liquid cooling|\bAIO\b/i, tr("Refroidissement par liquide, tout-en-un : un radiateur et des ventilateurs reliés au processeur par deux tuyaux.", "All-in-one liquid cooling: a radiator and fans linked to the processor by two tubes.")],
  [/\bi\/s\b|\bfps\b/i, tr("Images par seconde : plus il y en a, plus le jeu est fluide. 60 i/s, c'est fluide ; 144 et plus, c'est idéal pour un écran rapide.", "Frames per second: the more there are, the smoother the game. 60 fps is smooth; 144 and up is ideal for a fast monitor.")],
  [/\b80 ?Plus (Bronze|Gold|Platinum)\b/i, tr("Label de rendement de l'alimentation : Gold gaspille moins d'électricité et chauffe moins que Bronze.", "A power supply efficiency label: Gold wastes less electricity and runs cooler than Bronze.")],
  [/goulot d'étranglement|facteur limitant|bottleneck|limiting factor/i, tr("La pièce la plus lente du PC : c'est elle qui fixe la vitesse de l'ensemble.", "The slowest part of the PC: it sets the speed of the whole system.")],
];

const ANY = new RegExp(glossary().map(([r]) => `(${r.source})`).join("|"), "gi");

/** Le texte, avec chaque terme technique souligné et expliqué au survol (une seule fois par terme). */
export function T({ children }: { children: string }): ReactNode {
  const text = children;
  const GLOSSARY = glossary();
  const seen = new Set<string>();
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(ANY)) {
    const word = m[0];
    const def = GLOSSARY.find(([r]) => new RegExp(`^(?:${r.source})$`, "i").test(word))?.[1];
    if (!def || seen.has(def)) continue;
    seen.add(def);
    out.push(text.slice(last, m.index));
    out.push(
      <abbr key={m.index} className="term" title={def} tabIndex={0}>
        {word}
      </abbr>,
    );
    last = m.index! + word.length;
  }
  out.push(text.slice(last));
  return <Fragment>{out}</Fragment>;
}
