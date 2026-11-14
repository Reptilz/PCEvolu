// Test de la reconnaissance des composants à partir des noms donnés par Windows.
// Utilisation : npx tsx scripts/test-recognition.ts

import { findChipset, findCpu, findGpu } from "../src/upgrade/catalog";

let failures = 0;
function expect(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures++;
    console.log(`  ✗ ${label} : obtenu ${JSON.stringify(actual)}, attendu ${JSON.stringify(expected)}`);
  }
}

// [nom Windows, socket, génération, gaming min, gaming max, igpu, mobile]
const CPUS: [string, string, string, number, number, boolean, boolean][] = [
  ["Intel(R) Core(TM) i5-4460  CPU @ 3.20GHz", "LGA1150", "intel-4", 50, 65, true, false],
  ["Intel(R) Core(TM) i7-4790K CPU @ 4.00GHz", "LGA1150", "intel-4", 60, 75, true, false],
  ["Intel(R) Core(TM) i5-6500 CPU @ 3.20GHz", "LGA1151", "intel-6", 58, 72, true, false],
  ["Intel(R) Core(TM) i7-7700K CPU @ 4.20GHz", "LGA1151", "intel-7", 78, 92, true, false],
  ["Intel(R) Core(TM) i3-8100 CPU @ 3.60GHz", "LGA1151", "intel-8", 62, 75, true, false],
  ["Intel(R) Core(TM) i5-8400 CPU @ 2.80GHz", "LGA1151", "intel-8", 70, 85, true, false],
  ["Intel(R) Core(TM) i7-8700K CPU @ 3.70GHz", "LGA1151", "intel-8", 88, 100, true, false],
  ["Intel(R) Core(TM) i5-9400F CPU @ 2.90GHz", "LGA1151", "intel-9", 75, 88, false, false],
  ["Intel(R) Core(TM) i9-9900K CPU @ 3.60GHz", "LGA1151", "intel-9", 95, 106, true, false],
  ["Intel(R) Core(TM) i3-10100F CPU @ 3.60GHz", "LGA1200", "intel-10", 72, 82, false, false],
  ["Intel(R) Core(TM) i5-10400F CPU @ 2.90GHz", "LGA1200", "intel-10", 85, 95, false, false],
  ["Intel(R) Core(TM) i5-10600KF CPU @ 4.10GHz", "LGA1200", "intel-10", 98, 102, false, false],
  ["Intel(R) Core(TM) i9-10900K CPU @ 3.70GHz", "LGA1200", "intel-10", 108, 116, true, false],
  ["11th Gen Intel(R) Core(TM) i5-11400F @ 2.60GHz", "LGA1200", "intel-11", 90, 100, false, false],
  ["11th Gen Intel(R) Core(TM) i7-11700K @ 3.60GHz", "LGA1200", "intel-11", 110, 118, true, false],
  ["12th Gen Intel(R) Core(TM) i3-12100F", "LGA1700", "intel-12", 108, 118, false, false],
  ["12th Gen Intel(R) Core(TM) i5-12400F", "LGA1700", "intel-12", 120, 130, false, false],
  ["12th Gen Intel(R) Core(TM) i7-12700K", "LGA1700", "intel-12", 145, 155, true, false],
  ["13th Gen Intel(R) Core(TM) i5-13600KF", "LGA1700", "intel-13", 148, 156, false, false],
  ["13th Gen Intel(R) Core(TM) i9-13900K", "LGA1700", "intel-13", 165, 175, true, false],
  ["14th Gen Intel(R) Core(TM) i5-14400F", "LGA1700", "intel-14", 135, 145, false, false],
  ["14th Gen Intel(R) Core(TM) i7-14700K", "LGA1700", "intel-14", 165, 172, true, false],
  ["Intel(R) Core(TM) Ultra 5 245KF", "LGA1851", "intel-ultra2", 140, 150, false, false],
  ["Intel(R) Core(TM) Ultra 9 285K", "LGA1851", "intel-ultra2", 160, 168, true, false],
  ["Intel(R) Pentium(R) Gold G6400 CPU @ 4.00GHz", "LGA1200", "intel-10", 55, 70, true, false],
  ["Intel(R) Celeron(R) G5905 CPU @ 3.50GHz", "LGA1200", "intel-10", 55, 70, true, false],
  ["AMD Ryzen 5 1600 Six-Core Processor", "AM4", "amd-zen1", 65, 72, false, false],
  ["AMD Ryzen 7 2700X Eight-Core Processor", "AM4", "amd-zen1", 78, 85, false, false],
  ["AMD Ryzen 5 2400G with Radeon Vega Graphics", "AM4", "amd-zen1", 60, 70, true, false],
  ["AMD Ryzen 5 3600 6-Core Processor", "AM4", "amd-zen2", 84, 90, false, false],
  ["AMD Ryzen 9 3900X 12-Core Processor", "AM4", "amd-zen2", 92, 100, false, false],
  ["AMD Ryzen 5 5600X 6-Core Processor", "AM4", "amd-zen3", 108, 112, false, false],
  ["AMD Ryzen 5 5600G with Radeon Graphics", "AM4", "amd-zen3", 88, 96, true, false],
  ["AMD Ryzen 7 5800X3D 8-Core Processor", "AM4", "amd-zen3", 145, 145, false, false],
  ["AMD Ryzen 9 5950X 16-Core Processor", "AM4", "amd-zen3", 114, 120, false, false],
  ["AMD Ryzen 5 7500F 6-Core Processor", "AM5", "amd-zen4", 142, 150, false, false],
  ["AMD Ryzen 7 7800X3D 8-Core Processor", "AM5", "amd-zen4", 185, 185, true, false],
  ["AMD Ryzen 5 8600G w/ Radeon 760M Graphics", "AM5", "amd-zen4", 115, 125, true, false],
  ["AMD Ryzen 7 9800X3D 8-Core Processor", "AM5", "amd-zen5", 210, 210, true, false],
  ["AMD Ryzen 9 9950X 16-Core Processor", "AM5", "amd-zen5", 165, 172, true, false],
  // Portables
  ["11th Gen Intel(R) Core(TM) i7-1165G7 @ 2.80GHz", "LGA1200", "intel-11", 75, 90, true, true],
  ["12th Gen Intel(R) Core(TM) i5-12500H", "LGA1700", "intel-12", 95, 110, true, true],
  ["13th Gen Intel(R) Core(TM) i9-13980HX", "LGA1700", "intel-13", 125, 140, true, true],
  ["AMD Ryzen 7 5800H with Radeon Graphics", "AM4", "amd-zen3", 80, 95, false, true],
  ["AMD Ryzen 7 7840HS w/ Radeon 780M Graphics", "AM5", "amd-zen4", 110, 125, true, true],
];

console.log(`Processeurs (${CPUS.length})`);
for (const [name, socket, gen, gMin, gMax, igpu, mobile] of CPUS) {
  const c = findCpu(name);
  if (!c) {
    failures++;
    console.log(`  ✗ non reconnu : ${name}`);
    continue;
  }
  expect(`${name} socket`, c.socket, socket);
  expect(`${name} gen`, c.gen, gen);
  if (c.gaming < gMin || c.gaming > gMax) expect(`${name} gaming dans [${gMin}, ${gMax}]`, c.gaming, `${gMin}-${gMax}`);
  if (!mobile) expect(`${name} igpu`, c.igpu, igpu);
  expect(`${name} portable`, !!c.mobile, mobile);
  console.log(`  ${c.name.padEnd(30)} ${c.socket.padEnd(8)} ${c.gen.padEnd(13)} ${c.cores}C/${c.threads}T  jeu ${String(c.gaming).padStart(3)}  multi ${String(c.multi).padStart(3)}  ${String(c.powerW).padStart(3)} W  ${JSON.stringify(c.ramMaxMts)}${c.mobile ? "  portable" : ""}`);
}

// [nom Windows, id attendu (préfixe), intégré, portable, estimé]
const GPUS: [string, string, boolean, boolean, boolean][] = [
  ["NVIDIA GeForce GTX 1050 Ti", "gtx-1050ti", false, false, false],
  ["NVIDIA GeForce GTX 1060 6GB", "gtx-1060", false, false, false],
  ["NVIDIA GeForce GTX 1080 Ti", "gtx-1080ti", false, false, false],
  ["NVIDIA GeForce GTX 1650 SUPER", "gtx-1650s", false, false, false],
  ["NVIDIA GeForce GTX 1660 Ti", "gtx-1660ti", false, false, false],
  ["NVIDIA GeForce RTX 2060 SUPER", "rtx-2060s", false, false, false],
  ["NVIDIA GeForce RTX 2080 Ti", "rtx-2080ti", false, false, false],
  ["NVIDIA GeForce RTX 3060", "rtx-3060", false, false, false],
  ["NVIDIA GeForce RTX 3060 Ti", "rtx-3060ti", false, false, false],
  ["NVIDIA GeForce RTX 3070 Ti", "rtx-3070ti", false, false, false],
  ["NVIDIA GeForce RTX 3090", "rtx-3090", false, false, false],
  ["NVIDIA GeForce RTX 4060 Ti", "rtx-4060ti", false, false, false],
  ["NVIDIA GeForce RTX 4070 SUPER", "rtx-4070s", false, false, false],
  ["NVIDIA GeForce RTX 4070 Ti SUPER", "rtx-4070tis", false, false, false],
  ["NVIDIA GeForce RTX 4090", "rtx-4090", false, false, false],
  ["NVIDIA GeForce RTX 5070 Ti", "rtx-5070ti", false, false, false],
  ["NVIDIA GeForce RTX 5090", "rtx-5090", false, false, false],
  ["AMD Radeon RX 580 2048SP", "rx-480", false, false, false],
  ["Radeon RX 570 Series", "rx-470", false, false, false],
  ["AMD Radeon RX 5700 XT", "rx-5700xt", false, false, false],
  ["AMD Radeon RX 6600", "rx-6600", false, false, false],
  ["AMD Radeon RX 6650 XT", "rx-6600xt", false, false, false],
  ["AMD Radeon RX 6750 XT", "rx-6700xt", false, false, false],
  ["AMD Radeon RX 6800 XT", "rx-6800xt", false, false, false],
  ["AMD Radeon RX 7600", "rx-7600", false, false, false],
  ["AMD Radeon RX 7900 XTX", "rx-7900xtx", false, false, false],
  ["AMD Radeon RX 7900 XT", "rx-7900xt", false, false, false],
  ["AMD Radeon RX 9070 XT", "rx-9070xt", false, false, false],
  ["Intel(R) Arc(TM) A770 Graphics", "arc-a770", false, false, false],
  ["Intel(R) Arc(TM) B580 Graphics", "arc-b580", false, false, false],
  ["Intel(R) UHD Graphics 630", "igpu-intel", true, false, false],
  ["Intel(R) Iris(R) Xe Graphics", "igpu-intel", true, false, false],
  ["AMD Radeon(TM) Graphics", "igpu-amd", true, false, false],
  ["AMD Radeon(TM) Vega 8 Graphics", "igpu-amd", true, false, false],
  ["AMD Radeon 780M Graphics", "igpu-amd-780m", true, false, false],
  ["NVIDIA GeForce RTX 4060 Laptop GPU", "rtx-4060-laptop", false, true, false],
  ["NVIDIA GeForce RTX 3070 Laptop GPU", "rtx-3070-laptop", false, true, false],
  // Absents de la table : estimation par le modèle le plus proche
  ["NVIDIA GeForce RTX 3080 Ti Laptop GPU", "rtx-3080ti-laptop", false, true, false],
  ["NVIDIA GeForce GTX 1630", "estimate-", false, false, true],
  ["AMD Radeon RX 7650 GRE", "estimate-", false, false, true],
  ["NVIDIA GeForce RTX 2050", "estimate-", false, false, true],
];

console.log(`\nCartes graphiques (${GPUS.length})`);
for (const [name, id, integrated, mobile, estimated] of GPUS) {
  const g = findGpu(name);
  if (!g) {
    failures++;
    console.log(`  ✗ non reconnue : ${name}`);
    continue;
  }
  if (!g.id.startsWith(id)) expect(`${name} id`, g.id, id);
  expect(`${name} intégrée`, !!g.integrated, integrated);
  expect(`${name} portable`, !!g.mobile, mobile);
  expect(`${name} estimée`, !!g.estimated, estimated);
  console.log(`  ${name.padEnd(40)} → ${g.name.padEnd(34)} perf ${String(g.perf).padStart(3)}  ${g.tbp} W${g.estimated ? "  (estimée)" : ""}`);
}

// [nom de carte mère, chipset attendu]
const BOARDS: [string, string | undefined][] = [
  ["MAG B460 TORPEDO (MS-7C81)", "B460"],
  ["H81M-P33 (MS-7817)", "H81"],
  ["B85M-G", "B85"],
  ["Z97-A", "Z97"],
  ["PRIME B250M-A", "B250"],
  ["B360M PRO-VDH (MS-7B24)", "B360"],
  ["ROG STRIX Z390-E GAMING", "Z390"],
  ["PRIME B450M-A II", "B450"],
  ["B550 AORUS ELITE V2", "B550"],
  ["X570 AORUS MASTER", "X570"],
  ["PRO B760M-A WIFI DDR4 (MS-7D99)", "B760"],
  ["ROG STRIX Z790-F GAMING WIFI", "Z790"],
  ["B650M DS3H", "B650"],
  ["X670E AORUS MASTER", "X670"],
  ["MAG X870E TOMAHAWK WIFI", "X870"],
  ["0K240Y", undefined],
  ["To Be Filled By O.E.M.", undefined],
];
console.log(`\nChipsets (${BOARDS.length})`);
for (const [name, chip] of BOARDS) expect(`chipset de « ${name} »`, findChipset(name)?.chipset, chip);
console.log(`  ${BOARDS.length} cartes mères testées`);

console.log(failures === 0 ? "\n✓ Tout est reconnu correctement." : `\n✗ ${failures} écart(s).`);
process.exit(failures === 0 ? 0 : 1);
