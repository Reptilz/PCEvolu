// Lexique : les termes techniques restent dans le texte (pour les passionnés),
// avec leur explication au survol (pour tout le monde).

import { Fragment, type ReactNode } from "react";

const GLOSSARY: [RegExp, string][] = [
  [/dual[- ]channel/i, "Deux barrettes de RAM qui travaillent en parallèle : la mémoire va deux fois plus vite qu'avec une seule."],
  [/single[- ]channel/i, "Une seule barrette de RAM : la mémoire va moitié moins vite qu'avec deux barrettes identiques."],
  [/\bVRAM\b|mémoire vidéo/i, "La mémoire propre à la carte graphique, où sont chargées les textures des jeux. Trop peu, et les jeux saccadent."],
  [/\bchipset\b/i, "La puce de la carte mère qui décide quels processeurs, quelle RAM et quelles options sont possibles."],
  [/\bNVMe\b/i, "SSD très rapide qui se branche directement sur la carte mère, sans câble (jusqu'à 10 fois plus rapide qu'un disque dur)."],
  [/\bM\.2\b/i, "Format de SSD en forme de petite barrette, vissé directement sur la carte mère."],
  [/\bSATA\b/i, "Branchement classique des disques et SSD de 2,5 pouces, avec un câble. Plus lent qu'un SSD NVMe, mais suffisant au quotidien."],
  [/\bPCIe\b/i, "Le connecteur de la carte mère où se branchent la carte graphique et les SSD NVMe."],
  [/micro[- ]ATX|\bmATX\b/i, "Format de carte mère compact, pour les boîtiers moyens et petits."],
  [/\bATX\b/i, "Le format standard de carte mère et d'alimentation, celui de la plupart des PC fixes."],
  [/\bsocket\b|\bLGA ?1[0-9]{3}\b|\bAM[45]\b/i, "L'emplacement du processeur sur la carte mère. Un processeur ne rentre que dans le socket prévu pour lui."],
  [/\bDDR[45]\b/i, "La génération de RAM. DDR4 et DDR5 ne sont pas compatibles entre elles : la carte mère n'accepte que l'une des deux."],
  [/\bXMP\b|\bEXPO\b/i, "Réglage du BIOS qui fait tourner la RAM à sa vitesse annoncée. Sans lui, elle reste bridée."],
  [/\bBIOS\b/i, "Le logiciel interne de la carte mère, qui démarre le PC avant Windows."],
  [/\bTDP\b/i, "La chaleur que le composant dégage, en watts. Le refroidissement doit pouvoir l'évacuer."],
  [/12V-2x6|12VHPWR|câble 16 broches/i, "Prise d'alimentation des cartes graphiques récentes. Les alimentations plus anciennes ont besoin d'un adaptateur."],
  [/\bventirad\b/i, "Le radiateur avec ventilateur posé sur le processeur pour le refroidir."],
  [/watercooling|\bAIO\b/i, "Refroidissement par liquide, tout-en-un : un radiateur et des ventilateurs reliés au processeur par deux tuyaux."],
  [/\bi\/s\b/i, "Images par seconde : plus il y en a, plus le jeu est fluide. 60 i/s, c'est fluide ; 144 et plus, c'est idéal pour un écran rapide."],
  [/\b80 ?Plus (Bronze|Gold|Platinum)\b/i, "Label de rendement de l'alimentation : Gold gaspille moins d'électricité et chauffe moins que Bronze."],
  [/goulot d'étranglement|facteur limitant/i, "La pièce la plus lente du PC : c'est elle qui fixe la vitesse de l'ensemble."],
];

const ANY = new RegExp(GLOSSARY.map(([r]) => `(${r.source})`).join("|"), "gi");

/** Le texte, avec chaque terme technique souligné et expliqué au survol (une seule fois par terme). */
export function T({ children }: { children: string }): ReactNode {
  const text = children;
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
