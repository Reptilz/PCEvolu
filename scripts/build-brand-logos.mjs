// Génère src/brand-logos.ts : la librairie de logos de fabricants affichés dans l'app.
//
// Les logos viennent de Simple Icons (simpleicons.org, licence CC0), installé en dépendance de développement.
// Seuls les logos listés ci-dessous sont copiés : l'app n'embarque pas toute la bibliothèque.
// Pour ajouter une marque : ajoute une ligne { slug, match }, puis lance `npm run logos`.
// (`slug` = identifiant Simple Icons ; `match` = expression qui reconnaît la marque dans les noms lus par Windows.)

import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const BRANDS = [
  // Processeurs, cartes graphiques, puces
  { slug: "nvidia", match: "nvidia|geforce|quadro" },
  { slug: "amd", match: "\\bamd\\b|advanced micro devices|radeon|ryzen" },
  { slug: "intel", match: "\\bintel\\b" },
  { slug: "qualcomm", match: "qualcomm|atheros|snapdragon" },
  { slug: "broadcom", match: "broadcom" },
  // Cartes mères, PC, portables
  { slug: "republicofgamers", match: "\\brog\\b|republic of gamers" },
  { slug: "asus", match: "\\basus" },
  { slug: "msi", match: "\\bmsi\\b|micro-star" },
  { slug: "dell", match: "\\bdell\\b" },
  { slug: "alienware", match: "alienware" },
  { slug: "hp", match: "\\bhp\\b|hewlett[- ]packard" },
  { slug: "lenovo", match: "lenovo" },
  { slug: "acer", match: "\\bacer\\b" },
  { slug: "apple", match: "\\bapple\\b" },
  { slug: "huawei", match: "huawei" },
  { slug: "xiaomi", match: "xiaomi" },
  // Mémoire, stockage
  { slug: "samsung", match: "samsung" },
  { slug: "seagate", match: "seagate" },
  { slug: "toshiba", match: "toshiba" },
  // Boîtiers, refroidissement, alimentations, périphériques
  { slug: "corsair", match: "corsair" },
  { slug: "nzxt", match: "\\bnzxt\\b" },
  { slug: "coolermaster", match: "cooler ?master" },
  { slug: "deepcool", match: "deepcool" },
  { slug: "razer", match: "\\brazer\\b" },
  { slug: "steelseries", match: "steelseries" },
  { slug: "hyperx", match: "hyperx" },
  { slug: "elgato", match: "elgato" },
  // Écrans, son, réseau
  { slug: "lg", match: "\\blg\\b|lg electronics|goldstar" },
  { slug: "sony", match: "\\bsony\\b" },
  { slug: "jbl", match: "\\bjbl\\b" },
  { slug: "sennheiser", match: "sennheiser" },
  { slug: "bose", match: "\\bbose\\b" },
  { slug: "audiotechnica", match: "audio-?technica" },
  { slug: "astro", match: "\\bastro\\b" },
  { slug: "tplink", match: "tp-?link" },
  { slug: "netgear", match: "netgear" },
  { slug: "ubiquiti", match: "ubiquiti|unifi" },
];

const require = createRequire(import.meta.url);
const mod = await import(pathToFileURL(require.resolve("simple-icons")).href);
const icons = Object.values(mod.siNvidia ? mod : mod.default).filter((i) => i && i.slug);

/** Luminance relative (0 = noir, 1 = blanc) : les logos trop sombres ou trop clairs prennent la couleur du texte. */
const luminance = (hex) => {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

let out = `// Fichier généré par scripts/build-brand-logos.mjs (npm run logos) : ne pas modifier à la main.
//
// Logos de fabricants issus de Simple Icons (simpleicons.org, licence CC0). Ce sont des marques déposées de leurs
// propriétaires : ils servent uniquement à identifier le fabricant d'une pièce, sans partenariat ni approbation.

export interface BrandLogoData {
  title: string;
  /** Couleur officielle, ou null quand elle est trop sombre ou trop claire pour un fond sombre (le logo prend alors la couleur du texte). */
  hex: string | null;
  path: string;
}

export const BRAND_LOGOS: Record<string, BrandLogoData> = {
`;
const matchers = [];
for (const b of BRANDS) {
  const icon = icons.find((i) => i.slug === b.slug);
  if (!icon) {
    console.warn(`⚠ ${b.slug} : absent de Simple Icons, ignoré`);
    continue;
  }
  const l = luminance(icon.hex);
  const hex = l < 0.06 || l > 0.85 ? null : `#${icon.hex}`;
  out += `  ${JSON.stringify(b.slug)}: { title: ${JSON.stringify(icon.title)}, hex: ${JSON.stringify(hex)}, path: ${JSON.stringify(icon.path)} },\n`;
  matchers.push(`  [/${b.match}/i, ${JSON.stringify(b.slug)}],`);
}
out += `};

/** Reconnaît la marque dans un nom lu par Windows (« Micro-Star International », « NVIDIA GeForce… »), dans cet ordre. */
export const BRAND_MATCHERS: [RegExp, string][] = [
${matchers.join("\n")}
];
`;
writeFileSync(new URL("../src/brand-logos.ts", import.meta.url), out, "utf8");
console.log(`${matchers.length} logos écrits dans src/brand-logos.ts`);
