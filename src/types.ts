// Miroir des structures Rust (src-tauri/src/scan.rs et live.rs).

export interface Report {
  os: { name?: string; version?: string; build?: string; architecture?: string };
  system: { manufacturer?: string; model?: string; isLaptop: boolean };
  cpus: Cpu[];
  gpus: Gpu[];
  memory: Memory;
  board: Board;
  disks: Disk[];
  volumes: Volume[];
  displays: Display[];
  monitors: Monitor[];
  network: NetAdapter[];
  audio: { name?: string; manufacturer?: string }[];
}

export interface Cpu {
  name?: string;
  manufacturer?: string;
  cores?: number;
  threads?: number;
  baseMhz?: number;
  l2Kb?: number;
  l3Kb?: number;
  socket?: string;
  virtualization?: boolean;
}

export interface Gpu {
  name?: string;
  vramBytes?: number;
  driverVersion?: string;
  driverDate?: string;
}

export interface Memory {
  totalBytes: number;
  slotsTotal?: number;
  maxCapacityBytes?: number;
  modules: MemoryModule[];
}

export interface MemoryModule {
  manufacturer?: string;
  partNumber?: string;
  capacityBytes?: number;
  speedMts?: number;
  configuredMts?: number;
  slot?: string;
  bank?: string;
  kind?: string;
}

export interface Board {
  manufacturer?: string;
  product?: string;
  version?: string;
  biosVendor?: string;
  biosVersion?: string;
  biosDate?: string;
}

export interface Disk {
  name?: string;
  media: "HDD" | "SSD" | "SCM" | "Inconnu";
  bus: string;
  sizeBytes?: number;
  health: "healthy" | "warning" | "unhealthy" | "unknown";
}

export interface Volume {
  letter?: string;
  label?: string;
  fileSystem?: string;
  sizeBytes?: number;
  freeBytes?: number;
}

export interface Display {
  device: string;
  adapter: string;
  primary: boolean;
  width: number;
  height: number;
  currentHz: number;
  maxHz: number;
}

export interface Monitor {
  maker?: string;
  model?: string;
  year?: number;
}

export interface NetAdapter {
  name?: string;
  description?: string;
  connected: boolean;
  speedBps?: number;
  wireless: boolean;
}

export interface Metrics {
  cpuPercent?: number;
  ramUsedBytes?: number;
  ramTotalBytes?: number;
  uptimeSecs?: number;
  gpu?: {
    tempC?: number;
    usagePercent?: number;
    vramUsedMb?: number;
    vramTotalMb?: number;
    powerW?: number;
  };
}
