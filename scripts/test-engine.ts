// Test du moteur d'upgrades sur des configurations types (de la petite à la grosse).
// Utilisation : npx tsx scripts/test-engine.ts

import type { Report } from "../src/types";
import { buildProfile, DEFAULT_ANSWERS } from "../src/upgrade/profile";
import { proposeAll } from "../src/upgrade/engine";

const GB = 1024 ** 3;
const base = (o: Partial<Report>): Report => ({
  os: { name: "Windows 11" },
  system: { manufacturer: "Micro-Star International Co., Ltd.", model: "", isLaptop: false },
  cpus: [], gpus: [], memory: { totalBytes: 0, modules: [] },
  board: {}, disks: [], volumes: [], displays: [], monitors: [], network: [], audio: [],
  ...o,
});
const stick = (gb: number, kind: string, mts: number, slot = "ChannelA-DIMM1") => ({ capacityBytes: gb * GB, kind, speedMts: mts, configuredMts: mts, slot });

const CONFIGS: [string, Report][] = [
  ["PC de bureau Dell 2014 (i5-4460, graphiques intégrés, DDR3, disque dur)", base({
    system: { manufacturer: "Dell Inc.", model: "OptiPlex 9020", isLaptop: false },
    cpus: [{ name: "Intel(R) Core(TM) i5-4460  CPU @ 3.20GHz" }],
    gpus: [{ name: "Intel(R) HD Graphics 4600" }],
    memory: { totalBytes: 8 * GB, slotsTotal: 4, modules: [stick(4, "DDR3", 1600), stick(4, "DDR3", 1600, "ChannelB-DIMM1")] },
    board: { manufacturer: "Dell Inc.", product: "0V62H2" },
    disks: [{ name: "WDC WD5000AAKX", media: "HDD", bus: "SATA", sizeBytes: 500e9, health: "healthy" }],
  })],
  ["PC portable gamer (i7-12700H, RTX 3060 Laptop)", base({
    system: { manufacturer: "ASUSTeK COMPUTER INC.", model: "ROG Strix G15", isLaptop: true },
    cpus: [{ name: "12th Gen Intel(R) Core(TM) i7-12700H" }],
    gpus: [{ name: "NVIDIA GeForce RTX 3060 Laptop GPU" }],
    memory: { totalBytes: 16 * GB, slotsTotal: 2, modules: [stick(8, "DDR5", 4800), stick(8, "DDR5", 4800, "ChannelB-DIMM1")] },
    disks: [{ name: "Samsung PM9A1", media: "SSD", bus: "NVMe", sizeBytes: 1e12, health: "healthy" }],
  })],
  ["PC gamer d'entrée de gamme 2019 (Ryzen 5 2600, GTX 1060, B450)", base({
    cpus: [{ name: "AMD Ryzen 5 2600 Six-Core Processor" }],
    gpus: [{ name: "NVIDIA GeForce GTX 1060 6GB" }],
    memory: { totalBytes: 16 * GB, slotsTotal: 4, modules: [stick(8, "DDR4", 2933), stick(8, "DDR4", 2933, "ChannelB-DIMM1")] },
    board: { manufacturer: "Micro-Star International Co., Ltd.", product: "B450 TOMAHAWK MAX (MS-7C02)" },
    disks: [{ name: "Crucial MX500", media: "SSD", bus: "SATA", sizeBytes: 500e9, health: "healthy" }],
  })],
  ["Grosse config 2024 (Ryzen 7 7800X3D, RTX 4070 Super, B650)", base({
    cpus: [{ name: "AMD Ryzen 7 7800X3D 8-Core Processor" }],
    gpus: [{ name: "NVIDIA GeForce RTX 4070 SUPER" }],
    memory: { totalBytes: 32 * GB, slotsTotal: 4, modules: [stick(16, "DDR5", 6000), stick(16, "DDR5", 6000, "ChannelB-DIMM1")] },
    board: { manufacturer: "Gigabyte Technology Co., Ltd.", product: "B650 AORUS ELITE AX" },
    disks: [{ name: "Samsung 990 Pro", media: "SSD", bus: "NVMe", sizeBytes: 2e12, health: "healthy" }],
  })],
];

for (const [label, report] of CONFIGS) {
  const p = buildProfile(report, DEFAULT_ANSWERS);
  const all = proposeAll(p);
  console.log(`\n■ ${label}`);
  console.log(`  profil : ${p.cpu?.name ?? "CPU ?"} · ${p.gpu?.name ?? "GPU ?"} · ${p.socket ?? "?"} ${p.chipset?.chipset ?? "chipset ?"} · ${p.ramType ?? "?"} · PCIe ${p.pcieGen ?? "?"}` +
    `${p.isLaptop ? " · PORTABLE" : ""}${p.isOem ? " · PC DE MARQUE" : ""} · alim supposée ${p.psuWatts} W`);
  for (const [cat, list] of Object.entries(all)) {
    const top = list.slice(0, 3).map((x) => `${x.title} ${x.total} €${x.gainLabel ? ` (${x.gainLabel})` : ""}${x.additions.filter((a) => a.role === "required").length ? ` +${x.additions.filter((a) => a.role === "required").length} requis` : ""}`);
    console.log(`  ${cat.padEnd(8)} ${String(list.length).padStart(2)} proposition(s)${top.length ? " : " + top.join(" | ") : ""}`);
  }
}
