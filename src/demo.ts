// Données d'exemple utilisées quand l'interface tourne dans un simple navigateur
// (npm run dev) plutôt que dans l'app Tauri. Elles reprennent une vraie config.

import type { Metrics, Report } from "./types";

const GB = 1024 ** 3;

export const demoReport: Report = {
  os: { name: "Windows 11 Famille", version: "10.0.26300", build: "26300", architecture: "64 bits" },
  system: { manufacturer: "Micro-Star International Co., Ltd.", model: "MS-7C81", isLaptop: false },
  cpus: [
    { name: "Intel(R) Core(TM) i5-10600KF CPU @ 4.10GHz", manufacturer: "GenuineIntel", cores: 6, threads: 12, baseMhz: 4101, l2Kb: 1536, l3Kb: 12288, socket: "U3E1", virtualization: true },
  ],
  gpus: [{ name: "NVIDIA GeForce RTX 3060 Ti", vramBytes: 8 * GB, driverVersion: "32.0.16.2114", driverDate: "2026-10-27" }],
  memory: {
    totalBytes: 16 * GB,
    slotsTotal: 4,
    maxCapacityBytes: 64 * GB,
    modules: [{ manufacturer: "Crucial", partNumber: "CT16G4DFS8266.C8FB", capacityBytes: 16 * GB, speedMts: 2667, configuredMts: 2667, slot: "ChannelA-DIMM1", bank: "BANK 0", kind: "DDR4" }],
  },
  board: { manufacturer: "Micro-Star International Co., Ltd.", product: "MAG B460 TORPEDO (MS-7C81)", version: "2.0", biosVendor: "American Megatrends Inc.", biosVersion: "A.10", biosDate: "2020-10-13" },
  disks: [{ name: "KIOXIA-EXCERIA SSD", media: "SSD", bus: "NVMe", sizeBytes: 1000204886016, health: "healthy" }],
  volumes: [{ letter: "C:", label: "Windows", fileSystem: "NTFS", sizeBytes: 989548507136, freeBytes: 522623107072 }],
  displays: [{ device: "\\\\.\\DISPLAY1", adapter: "NVIDIA GeForce RTX 3060 Ti", primary: true, width: 2560, height: 1440, currentHz: 59, maxHz: 144 }],
  monitors: [{ maker: "AOC", model: "Q27G2WG4", year: 2021 }],
  network: [{ name: "Ethernet 2", description: "Realtek PCIe 2.5GbE Family Controller #2", connected: true, speedBps: 1e9, wireless: false }],
  audio: [
    { name: "CORSAIR VOID ELITE Wireless Gaming Headset", manufacturer: "CORSAIR" },
    { name: "NVIDIA High Definition Audio", manufacturer: "NVIDIA" },
    { name: "Périphérique High Definition Audio", manufacturer: "Microsoft" },
  ],
};

export function demoMetrics(): Metrics {
  const jitter = (base: number, spread: number) => base + (Math.random() - 0.5) * spread;
  return {
    cpuPercent: jitter(38, 20),
    ramUsedBytes: jitter(11.1, 0.4) * GB,
    ramTotalBytes: 15.9 * GB,
    uptimeSecs: 3 * 86400 + 16 * 3600,
    gpu: { tempC: jitter(44, 3), usagePercent: jitter(40, 20), vramUsedMb: 618, vramTotalMb: 8192, powerW: jitter(17, 4) },
  };
}
