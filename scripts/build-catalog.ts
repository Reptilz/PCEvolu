// Exporte le catalogue (code TypeScript) vers data/catalog.json, le fichier que l'app télécharge.
// À lancer après chaque modification du catalogue, en pensant à augmenter CATALOG_VERSION.
// Utilisation : npm run catalog

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { exportCatalog } from "../src/upgrade/catalog-remote";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "catalog.json");
const file = exportCatalog();
writeFileSync(out, JSON.stringify(file, null, 1) + "\n", "utf8");
console.log(
  `Catalogue v${file.version} → ${out}\n` +
    `  ${file.chipsets.length} chipsets, ${file.cpus.length} processeurs à l'achat, ${file.gpus.length} cartes graphiques, ` +
    `${file.boards.length} cartes mères, ${file.ram.length} kits RAM, ${file.ssds.length} SSD, ${file.psus.length} alims, ` +
    `${file.coolers.length} ventirads, ${file.cases.length} boîtiers`,
);
