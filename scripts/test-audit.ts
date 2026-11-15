// Audit de compatibilité à grande échelle : on fabrique une quinzaine de PC types (Intel 8e à Core Ultra, Ryzen 1000
// à 9000, portables, PC de marque, petits boîtiers, petites alimentations…), puis on vérifie des règles qui doivent
// TOUJOURS être vraies sur chaque proposition, chaque plan et des sélections tirées au hasard.
//
// Utilisation : npx tsx scripts/test-audit.ts

import { readFileSync } from "node:fs";
import type { Report } from "../src/types";
import type { Addition, BoardSpec, Category, CoolerSpec, CpuSpec, GpuSpec, Proposal, PsuSpec, RamKit, SsdSpec } from "../src/upgrade/types";
import { demoReport } from "../src/demo";
import { buildProfile, DEFAULT_ANSWERS, type Answers, type Profile } from "../src/upgrade/profile";
import { proposeAll, psuNeed, psuNeedReal } from "../src/upgrade/engine";
import type { Goal } from "../src/upgrade/goal";
import { optimize, planFromChoice, planTitle, type Plan } from "../src/upgrade/optimizer";
import { BOARDS, CASES, CHIPSETS, COOLERS, CPUS, FAN_KITS, GPUS, PSUS, RAM_KITS, SSDS } from "../src/upgrade/catalog";
import { KNOWN_BOARDS } from "../src/upgrade/boards";

// Prix du dernier relevé, comme dans l'app.
const prices = JSON.parse(readFileSync(new URL("../data/prices.json", import.meta.url), "utf8")).items as Record<string, { price: number }>;
for (const p of [...GPUS, ...CPUS, ...BOARDS, ...RAM_KITS, ...SSDS, ...PSUS, ...COOLERS, ...FAN_KITS, ...CASES]) {
  if (prices[p.id]) (p as { price?: number }).price = prices[p.id].price;
}

const GB = 1024 ** 3;
const problems: string[] = [];
let checks = 0;
const expect = (ok: boolean, msg: string) => {
  checks++;
  if (!ok) problems.push(msg);
};

// ---------------------------------------------------------------------------
// PC types
// ---------------------------------------------------------------------------

interface Case {
  name: string;
  cpu: string;
  gpu: string;
  board: string;
  ram: { kind: "DDR3" | "DDR4" | "DDR5"; gb: number; sticks: number; mts: number };
  slots?: number;
  laptop?: boolean;
  maker?: string;
  disks?: Report["disks"];
}

const CASES_PC: Case[] = [
  { name: "Ta config (i5-10600KF, B460, RTX 3060 Ti)", cpu: "Intel(R) Core(TM) i5-10600KF CPU @ 4.10GHz", gpu: "NVIDIA GeForce RTX 3060 Ti", board: "MAG B460 TORPEDO (MS-7C81)", ram: { kind: "DDR4", gb: 16, sticks: 1, mts: 2667 } },
  { name: "Bureautique i5-8400 sans carte graphique", cpu: "Intel(R) Core(TM) i5-8400 CPU @ 2.80GHz", gpu: "Intel(R) UHD Graphics 630", board: "B360M PRO-VDH (MS-7B24)", ram: { kind: "DDR4", gb: 8, sticks: 1, mts: 2666 } },
  { name: "Ryzen 5 2600 + GTX 1060 sur B450", cpu: "AMD Ryzen 5 2600 Six-Core Processor", gpu: "NVIDIA GeForce GTX 1060 6GB", board: "B450 TOMAHAWK MAX (MS-7C02)", ram: { kind: "DDR4", gb: 16, sticks: 2, mts: 3000 } },
  { name: "Ryzen 5 3600 + RX 5700 XT sur B550", cpu: "AMD Ryzen 5 3600 6-Core Processor", gpu: "AMD Radeon RX 5700 XT", board: "TUF GAMING B550-PLUS", ram: { kind: "DDR4", gb: 16, sticks: 2, mts: 3200 } },
  { name: "Ryzen 7 1700 sur A320 (vieux AM4)", cpu: "AMD Ryzen 7 1700 Eight-Core Processor", gpu: "NVIDIA GeForce GTX 1070", board: "A320M-S2H", ram: { kind: "DDR4", gb: 16, sticks: 2, mts: 2400 } },
  { name: "i5-12400F + RTX 3060 sur B660 DDR4", cpu: "12th Gen Intel(R) Core(TM) i5-12400F", gpu: "NVIDIA GeForce RTX 3060", board: "PRO B660M-A DDR4 (MS-7D43)", ram: { kind: "DDR4", gb: 16, sticks: 2, mts: 3200 } },
  { name: "i7-13700K + RTX 4070 sur Z790 DDR5", cpu: "13th Gen Intel(R) Core(TM) i7-13700K", gpu: "NVIDIA GeForce RTX 4070", board: "PRO Z790-P WIFI (MS-7E06)", ram: { kind: "DDR5", gb: 32, sticks: 2, mts: 5600 } },
  { name: "Ryzen 5 7600 + RX 7600 sur A620 (micro-ATX)", cpu: "AMD Ryzen 5 7600 6-Core Processor", gpu: "AMD Radeon RX 7600", board: "PRO A620M-E (MS-7E28)", ram: { kind: "DDR5", gb: 32, sticks: 2, mts: 5200 }, slots: 2 },
  { name: "Ryzen 7 9800X3D + RTX 5080 sur B850", cpu: "AMD Ryzen 7 9800X3D 8-Core Processor", gpu: "NVIDIA GeForce RTX 5080", board: "MAG B850 TOMAHAWK MAX WIFI (MS-7E62)", ram: { kind: "DDR5", gb: 32, sticks: 2, mts: 6000 } },
  { name: "Core Ultra 5 245K sur B860", cpu: "Intel(R) Core(TM) Ultra 5 245K", gpu: "NVIDIA GeForce RTX 4060", board: "PRO B860-P (MS-7E41)", ram: { kind: "DDR5", gb: 32, sticks: 2, mts: 6400 } },
  { name: "Ryzen 5 8600G sans carte graphique (B650)", cpu: "AMD Ryzen 5 8600G w/ Radeon 760M Graphics", gpu: "AMD Radeon(TM) 760M Graphics", board: "B650M DS3H", ram: { kind: "DDR5", gb: 16, sticks: 2, mts: 5200 } },
  { name: "PC portable (i7-12700H + RTX 3060 Laptop)", cpu: "12th Gen Intel(R) Core(TM) i7-12700H", gpu: "NVIDIA GeForce RTX 3060 Laptop GPU", board: "ROG Strix G513", ram: { kind: "DDR4", gb: 16, sticks: 2, mts: 3200 }, laptop: true },
  { name: "PC de marque Dell (i5-10400 + GTX 1650)", cpu: "Intel(R) Core(TM) i5-10400 CPU @ 2.90GHz", gpu: "NVIDIA GeForce GTX 1650", board: "0K3CM7", ram: { kind: "DDR4", gb: 8, sticks: 1, mts: 2666 }, maker: "Dell Inc." },
  { name: "Vieux i7-4790 DDR3", cpu: "Intel(R) Core(TM) i7-4790 CPU @ 3.60GHz", gpu: "NVIDIA GeForce GTX 970", board: "Z97-A", ram: { kind: "DDR3", gb: 16, sticks: 2, mts: 1600 } },
  { name: "Station X99 (non prise en charge)", cpu: "Intel(R) Core(TM) i7-5820K CPU @ 3.30GHz", gpu: "NVIDIA GeForce GTX 1080", board: "X99-A", ram: { kind: "DDR4", gb: 32, sticks: 4, mts: 2400 }, slots: 8 },
  { name: "Ryzen 5 5500 + RTX 2060 sur B550 (PCIe 3.0)", cpu: "AMD Ryzen 5 5500 6-Core Processor", gpu: "NVIDIA GeForce RTX 2060", board: "B550M DS3H", ram: { kind: "DDR4", gb: 16, sticks: 2, mts: 3200 } },
];

function makeReport(c: Case): Report {
  return {
    ...demoReport,
    system: { manufacturer: c.maker ?? "Micro-Star International Co., Ltd.", model: "", isLaptop: !!c.laptop },
    cpus: [{ ...demoReport.cpus[0], name: c.cpu }],
    gpus: [{ ...demoReport.gpus[0], name: c.gpu }],
    memory: {
      ...demoReport.memory,
      totalBytes: c.ram.gb * GB,
      slotsTotal: c.slots ?? 4,
      modules: Array.from({ length: c.ram.sticks }, (_, i) => ({ capacityBytes: (c.ram.gb / c.ram.sticks) * GB, kind: c.ram.kind, speedMts: c.ram.mts, configuredMts: c.ram.mts, slot: `Channel${i ? "B" : "A"}-DIMM1` })),
    },
    board: { ...demoReport.board, product: c.board, manufacturer: c.maker ?? "Micro-Star International Co., Ltd." },
    disks: c.disks ?? demoReport.disks,
  } as Report;
}

const ANSWERS: [string, Answers][] = [
  ["réponses inconnues", DEFAULT_ANSWERS],
  ["petit boîtier, alim 450 W, ventirad d'origine, 1 ventilateur", { psuWatts: 450, psu12v2x6: "no", caseSize: "small", gpuMaxMm: 280, caseFans: 1, cooler: "stock" }],
  ["grand boîtier, alim 1000 W 12V-2x6, gros ventirad, 3 ventilateurs", { psuWatts: 1000, psu12v2x6: "yes", caseSize: "full", gpuMaxMm: 400, caseFans: 3, cooler: "tower-dual" }],
];

const GOALS: Goal[] = [
  { usage: "gaming", resolution: "1440p", fps: 100, budget: 1500, configured: true },
  { usage: "gaming", resolution: "1080p", fps: 144, budget: null, configured: true },
  { usage: "office", resolution: "1080p", fps: 60, budget: 400, configured: true },
  { usage: "creation", resolution: "4k", fps: 60, budget: 2500, configured: true },
];

// ---------------------------------------------------------------------------
// Règles
// ---------------------------------------------------------------------------

const req = (pr: { additions: Addition[] }, kind: string) => pr.additions.find((a) => a.role === "required" && a.part.kind === kind)?.part;
const anyAdd = (pr: { additions: Addition[] }, kind: string) => pr.additions.find((a) => a.part.kind === kind)?.part;
const chipsetOf = (b: BoardSpec) => CHIPSETS.find((c) => c.chipset === b.chipset);

function checkCpuProposal(tag: string, p: Profile, pr: Proposal) {
  const c = pr.main as CpuSpec;
  const board = req(pr, "board") as BoardSpec | undefined;
  if (board) {
    expect(board.socket === c.socket, `${tag} : carte mère ${board.name} (${board.socket}) ≠ socket ${c.socket}`);
    expect(!!chipsetOf(board)?.cpuGens.includes(c.gen), `${tag} : chipset ${board.chipset} ne supporte pas ${c.gen}`);
    const ram = req(pr, "ram") as RamKit | undefined;
    if (board.ramType !== p.ramType) expect(!!ram, `${tag} : RAM ${p.ramType} incompatible avec ${board.ramType} mais aucun kit ajouté`);
    if (ram) expect(ram.type === board.ramType, `${tag} : kit ${ram.type} sur carte ${board.ramType}`);
    expect(!!c.ramMaxMts[board.ramType], `${tag} : ${c.name} ne gère pas la ${board.ramType}`);
    // Ventirad : si la fixation change, il en faut un compatible avec le nouveau socket.
    const cooler = anyAdd(pr, "cooler") as CoolerSpec | undefined;
    if (cooler) expect(cooler.sockets.includes(c.socket), `${tag} : ventirad ${cooler.name} sans fixation ${c.socket}`);
  } else {
    expect(c.socket === p.socket, `${tag} : processeur ${c.socket} sans carte mère sur un PC ${p.socket}`);
    expect(!!p.chipset?.cpuGens.includes(c.gen), `${tag} : ${c.gen} posé sur ${p.chipset?.chipset} sans changer de carte`);
  }
  // Pas d'image sans puce graphique ni carte graphique.
  if (!c.igpu && (!p.gpu || p.gpu.integrated)) expect(!!req(pr, "gpu"), `${tag} : processeur sans iGPU et PC sans carte graphique, mais pas de carte ajoutée`);
}

function checkGpuProposal(tag: string, p: Profile, pr: Proposal) {
  const g = pr.main as GpuSpec;
  const psu = anyAdd(pr, "psu") as PsuSpec | undefined;
  const need = psuNeed(p.cpu?.powerW, g);
  if (psu) {
    expect(psu.watts >= need, `${tag} : alim ${psu.watts} W < ${need} W conseillés`);
    if (g.power === "12V-2x6") expect(psu.native12v2x6 || psu.pcie8pin >= 2, `${tag} : alim sans 12V-2x6 ni câbles 8 broches`);
  }
  if (p.psuKnown && p.psuWatts < psuNeedReal(p.cpu?.powerW, g)) {
    expect(!!req(pr, "psu"), `${tag} : alim de ${p.psuWatts} W trop juste (≈ ${psuNeedReal(p.cpu?.powerW, g)} W) mais aucune ajoutée`);
  }
  const box = req(pr, "case");
  if (p.gpuMaxMm != null && g.lengthMm > p.gpuMaxMm) expect(!!box, `${tag} : carte de ${g.lengthMm} mm dans un boîtier de ${p.gpuMaxMm} mm, aucun boîtier ajouté`);
  if (box && box.kind === "case") expect(box.maxGpuMm >= g.lengthMm, `${tag} : boîtier ${box.name} trop court pour ${g.lengthMm} mm`);
  expect(!p.gpu || g.perf >= p.gpu.perf, `${tag} : carte proposée moins puissante que l'actuelle`);
}

function checkRamProposal(tag: string, p: Profile, pr: Proposal) {
  const k = pr.main as RamKit;
  expect(k.type === p.ramType, `${tag} : kit ${k.type} sur une plateforme ${p.ramType}`);
  const total = pr.id.startsWith("ram-add") ? p.ramTotalGb + k.sticks * k.gbPerStick : k.sticks * k.gbPerStick;
  if (p.ramMaxGb) expect(total <= p.ramMaxGb, `${tag} : ${total} Go > maximum ${p.ramMaxGb} Go`);
  if (pr.id.startsWith("ram-add")) expect(p.ramModules + k.sticks <= p.ramSlots, `${tag} : ${p.ramModules + k.sticks} barrettes pour ${p.ramSlots} emplacements`);
}

function checkStorageProposal(tag: string, p: Profile, pr: Proposal) {
  const s = pr.main as SsdSpec;
  if (s.iface === "HDD") expect(!p.isLaptop, `${tag} : disque dur 3,5" proposé sur un portable`);
  if (s.iface.startsWith("NVMe") && p.m2Total != null) expect(p.m2Total - p.m2Used > 0, `${tag} : SSD NVMe sans emplacement M.2 libre`);
}

function checkPlan(tag: string, p: Profile, plan: Plan) {
  const fails = (plan.checks ?? []).filter((c) => c.status === "fail");
  expect(fails.length === 0, `${tag} : contrôle non résolu « ${fails.map((f) => `${f.label} : ${f.detail}`).join(" | ")} »`);
  for (const kind of ["psu", "cooler", "case", "board"]) {
    const n = plan.additions.filter((a) => a.part.kind === kind && a.role === "required").length;
    expect(n <= 1, `${tag} : ${n} pièces « ${kind} » obligatoires (doublon)`);
  }
  const cpu = (plan.choice.cpu?.main as CpuSpec | undefined) ?? p.cpu;
  const gpu = (plan.choice.gpu?.main as GpuSpec | undefined) ?? (plan.choice.cpu?.additions.find((a) => a.part.kind === "gpu")?.part as GpuSpec | undefined) ?? p.gpu;
  const psu = plan.additions.find((a) => a.part.kind === "psu" && a.role === "required")?.part as PsuSpec | undefined;
  if (psu && gpu && !gpu.integrated) expect(psu.watts >= psuNeed(cpu?.powerW, gpu), `${tag} : alim ${psu.watts} W < ${psuNeed(cpu?.powerW, gpu)} W pour le couple final`);
  const board = plan.choice.cpu ? req(plan.choice.cpu, "board") : undefined;
  const ramAdd = plan.additions.find((a) => a.part.kind === "ram")?.part as RamKit | undefined;
  if (board && board.kind === "board" && ramAdd) expect(ramAdd.type === board.ramType, `${tag} : kit ${ramAdd.type} avec une carte ${board.ramType}`);
  if (board && board.kind === "board" && plan.choice.ram) expect((plan.choice.ram.main as RamKit).type === board.ramType, `${tag} : RAM choisie ${(plan.choice.ram.main as RamKit).type} sur nouvelle carte ${board.ramType}`);
  expect(plan.cost > 0 && Number.isFinite(plan.cost), `${tag} : coût invalide`);
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

for (const b of KNOWN_BOARDS) {
  const ch = chipsetOf(b);
  expect(!!ch, `Base cartes : ${b.name} chipset ${b.chipset} inconnu`);
  if (ch) expect(ch.socket === b.socket, `Base cartes : ${b.name} socket ${b.socket} ≠ chipset ${ch.socket}`);
  if (ch && b.ramType) expect(ch.ramTypes.includes(b.ramType), `Base cartes : ${b.name} en ${b.ramType}, chipset ${ch.ramTypes.join("/")}`);
  if (b.m2Gens) expect(b.m2Gens.length === b.m2Slots, `Base cartes : ${b.name} ${b.m2Slots} M.2 mais ${b.m2Gens.length} générations`);
  if (b.pcieGpu) expect(b.pcieGpu >= 3 && b.pcieGpu <= 5, `Base cartes : ${b.name} PCIe ${b.pcieGpu}`);
  for (const [fam, v] of Object.entries(b.biosMin ?? {})) if (v && v.date) expect(!Number.isNaN(Date.parse(v.date)), `Base cartes : ${b.name} date BIOS ${fam} invalide`);
}
for (const b of BOARDS.filter((x) => x.availability)) {
  const ch = chipsetOf(b);
  expect(!!ch && ch.socket === b.socket && ch.ramTypes.includes(b.ramType), `Carte générique ${b.name} incohérente avec son chipset`);
}
for (const p of [...GPUS, ...CPUS, ...BOARDS, ...RAM_KITS, ...SSDS, ...PSUS, ...COOLERS, ...FAN_KITS, ...CASES]) {
  const sale = !("availability" in p) || p.availability != null;
  if (sale && p.price != null) expect(p.price > 0, `Prix nul : ${p.id}`);
}
for (const c of CPUS) expect(!!c.socket && c.cores > 0 && c.powerW > 0, `Processeur mal décodé : ${c.name}`);

// ---------------------------------------------------------------------------
// Parcours de tous les PC × réponses × objectifs
// ---------------------------------------------------------------------------

let proposals = 0;
let plans = 0;
let rnd = 42;
const rand = (n: number) => ((rnd = (rnd * 1103515245 + 12345) % 2147483648), rnd % n);

for (const pc of CASES_PC) {
  const r = makeReport(pc);
  for (const [ansName, ans] of ANSWERS) {
    const p = buildProfile(r, ans);
    const tag = `${pc.name} / ${ansName}`;
    const all = proposeAll(p);
    if (pc.laptop) {
      expect(all.gpu.length === 0 && all.cpu.length === 0 && all.board.length === 0, `${tag} : pièces soudées proposées sur un portable`);
    }
    if (pc.ram.kind === "DDR3") expect(all.ram.length === 0, `${tag} : RAM DDR3 proposée`);
    for (const pr of all.cpu) checkCpuProposal(`${tag} / ${pr.title}`, p, pr);
    for (const pr of all.gpu) checkGpuProposal(`${tag} / ${pr.title}`, p, pr);
    for (const pr of all.ram) checkRamProposal(`${tag} / ${pr.title}`, p, pr);
    for (const pr of all.storage) checkStorageProposal(`${tag} / ${pr.title}`, p, pr);
    for (const pr of all.board) {
      const cpu = req(pr, "cpu") as CpuSpec | undefined;
      expect(!!cpu && (pr.main as BoardSpec).socket === cpu.socket, `${tag} / ${pr.title} : carte et processeur de sockets différents`);
    }
    proposals += Object.values(all).reduce((s, l) => s + l.length, 0);

    for (const goal of GOALS) {
      const res = optimize(goal, p, r, all);
      for (const pl of [res.best, res.cheapestReach, ...res.tiers, ...res.alternatives].filter(Boolean) as Plan[]) {
        checkPlan(`${tag} / ${goal.usage} ${goal.resolution} / plan ${planTitle(pl)}`, p, pl);
        plans++;
      }
    }

    // Sélections au hasard (comme « Ma sélection ») : chaque combinaison doit rester cohérente.
    for (let i = 0; i < 40; i++) {
      const choice: Partial<Record<Category, Proposal>> = {};
      for (const cat of ["gpu", "cpu", "ram", "storage"] as const) if (all[cat].length && rand(2)) choice[cat] = all[cat][rand(all[cat].length)];
      if (choice.cpu && req(choice.cpu, "ram")) delete choice.ram; // l'app ne permet pas de RAM en plus d'une plateforme qui en apporte
      if (!Object.keys(choice).length) continue;
      const pl = planFromChoice(GOALS[0], p, r, choice);
      checkPlan(`${tag} / sélection ${planTitle(pl)}`, p, pl);
      plans++;
    }
  }
}

console.log(`\n${CASES_PC.length} PC types × ${ANSWERS.length} jeux de réponses × ${GOALS.length} objectifs`);
console.log(`${proposals} propositions, ${plans} plans et sélections, ${checks} règles vérifiées.`);
const uniq = [...new Set(problems)];
if (uniq.length) {
  console.log(`\n✗ ${uniq.length} problème(s) :`);
  for (const m of uniq.slice(0, 80)) console.log(`  - ${m}`);
  process.exit(1);
} else {
  console.log("✓ Aucune incohérence.");
}
