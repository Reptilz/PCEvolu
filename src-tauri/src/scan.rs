//! Scan matériel complet de la machine (Windows).
//!
//! Tout est lu en local via WMI, le registre et l'API d'affichage de Windows.
//! Aucun numéro de série ni nom d'utilisateur n'est collecté.

use serde::Serialize;
use std::collections::HashMap;
use wmi::{Variant, WMIConnection};

type Row = HashMap<String, Variant>;

// ---------------------------------------------------------------------------
// Structures renvoyées à l'interface (sérialisées en camelCase pour TypeScript)
// ---------------------------------------------------------------------------

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub os: OsInfo,
    pub system: SystemInfo,
    pub cpus: Vec<Cpu>,
    pub gpus: Vec<Gpu>,
    pub memory: Memory,
    pub board: Board,
    pub disks: Vec<Disk>,
    pub volumes: Vec<Volume>,
    pub displays: Vec<Display>,
    pub monitors: Vec<Monitor>,
    pub network: Vec<NetAdapter>,
    pub audio: Vec<AudioDevice>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct OsInfo {
    pub name: Option<String>,
    pub version: Option<String>,
    pub build: Option<String>,
    pub architecture: Option<String>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub manufacturer: Option<String>,
    pub model: Option<String>,
    pub is_laptop: bool,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Cpu {
    pub name: Option<String>,
    pub manufacturer: Option<String>,
    pub cores: Option<u64>,
    pub threads: Option<u64>,
    pub base_mhz: Option<u64>,
    pub l2_kb: Option<u64>,
    pub l3_kb: Option<u64>,
    pub socket: Option<String>,
    pub virtualization: Option<bool>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Gpu {
    pub name: Option<String>,
    pub vram_bytes: Option<u64>,
    pub driver_version: Option<String>,
    pub driver_date: Option<String>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Memory {
    pub total_bytes: u64,
    pub slots_total: Option<u64>,
    pub max_capacity_bytes: Option<u64>,
    pub modules: Vec<MemoryModule>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MemoryModule {
    pub manufacturer: Option<String>,
    pub part_number: Option<String>,
    pub capacity_bytes: Option<u64>,
    pub speed_mts: Option<u64>,
    pub configured_mts: Option<u64>,
    pub slot: Option<String>,
    pub bank: Option<String>,
    pub kind: Option<String>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Board {
    pub manufacturer: Option<String>,
    pub product: Option<String>,
    pub version: Option<String>,
    pub bios_vendor: Option<String>,
    pub bios_version: Option<String>,
    pub bios_date: Option<String>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Disk {
    pub name: Option<String>,
    pub media: String,
    pub bus: String,
    pub size_bytes: Option<u64>,
    pub health: String,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Volume {
    pub letter: Option<String>,
    pub label: Option<String>,
    pub file_system: Option<String>,
    pub size_bytes: Option<u64>,
    pub free_bytes: Option<u64>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Display {
    pub device: String,
    pub adapter: String,
    pub primary: bool,
    pub width: u32,
    pub height: u32,
    pub current_hz: u32,
    /// Fréquence maximale disponible à la résolution actuelle.
    pub max_hz: u32,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Monitor {
    pub maker: Option<String>,
    pub model: Option<String>,
    pub year: Option<u64>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct NetAdapter {
    pub name: Option<String>,
    pub description: Option<String>,
    pub connected: bool,
    pub speed_bps: Option<u64>,
    pub wireless: bool,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AudioDevice {
    pub name: Option<String>,
    pub manufacturer: Option<String>,
}

// ---------------------------------------------------------------------------
// Commande appelée par l'interface
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn scan() -> Result<Report, String> {
    // WMI demande un thread dédié (initialisation COM) : on sort du thread async.
    tauri::async_runtime::spawn_blocking(collect)
        .await
        .map_err(|e| e.to_string())?
}

pub fn collect() -> Result<Report, String> {
    let cimv2 = WMIConnection::new().map_err(|e| format!("WMI indisponible : {e}"))?;
    let monitor_ns = WMIConnection::with_namespace_path("ROOT\\WMI").ok();
    let storage_ns = WMIConnection::with_namespace_path("ROOT\\Microsoft\\Windows\\Storage").ok();
    let net_ns = WMIConnection::with_namespace_path("ROOT\\StandardCimv2").ok();

    Ok(Report {
        os: os(&cimv2),
        system: system(&cimv2),
        cpus: cpus(&cimv2),
        gpus: gpus(&cimv2),
        memory: memory(&cimv2),
        board: board(&cimv2),
        disks: storage_ns.as_ref().map(disks).unwrap_or_default(),
        volumes: volumes(&cimv2),
        displays: displays(),
        monitors: monitor_ns.as_ref().map(monitors).unwrap_or_default(),
        network: net_ns.as_ref().map(network).unwrap_or_default(),
        audio: audio(&cimv2),
    })
}

// ---------------------------------------------------------------------------
// Lecteurs par composant
// ---------------------------------------------------------------------------

fn os(c: &WMIConnection) -> OsInfo {
    let r = first(c, "SELECT Caption, Version, BuildNumber, OSArchitecture FROM Win32_OperatingSystem");
    OsInfo {
        name: s(&r, "Caption").map(|n| n.replace("Microsoft ", "")),
        version: s(&r, "Version"),
        build: s(&r, "BuildNumber"),
        architecture: s(&r, "OSArchitecture"),
    }
}

fn system(c: &WMIConnection) -> SystemInfo {
    let r = first(c, "SELECT Manufacturer, Model, PCSystemType FROM Win32_ComputerSystem");
    SystemInfo {
        manufacturer: s(&r, "Manufacturer"),
        model: s(&r, "Model"),
        // PCSystemType 2 = portable
        is_laptop: u(&r, "PCSystemType") == Some(2),
    }
}

fn cpus(c: &WMIConnection) -> Vec<Cpu> {
    rows(c, "SELECT Name, Manufacturer, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed, L2CacheSize, L3CacheSize, SocketDesignation, VirtualizationFirmwareEnabled FROM Win32_Processor")
        .iter()
        .map(|r| Cpu {
            name: s(r, "Name").map(|n| n.split_whitespace().collect::<Vec<_>>().join(" ")),
            manufacturer: s(r, "Manufacturer"),
            cores: u(r, "NumberOfCores"),
            threads: u(r, "NumberOfLogicalProcessors"),
            base_mhz: u(r, "MaxClockSpeed"),
            l2_kb: u(r, "L2CacheSize"),
            l3_kb: u(r, "L3CacheSize"),
            socket: s(r, "SocketDesignation"),
            virtualization: b(r, "VirtualizationFirmwareEnabled"),
        })
        .collect()
}

fn gpus(c: &WMIConnection) -> Vec<Gpu> {
    let vram = registry_vram();
    rows(c, "SELECT Name, AdapterRAM, DriverVersion, DriverDate FROM Win32_VideoController")
        .iter()
        .filter(|r| {
            // On ignore les adaptateurs virtuels (bureau à distance, etc.)
            let n = s(r, "Name").unwrap_or_default().to_lowercase();
            !n.contains("remote") && !n.contains("basic display") && !n.contains("virtual")
        })
        .map(|r| {
            let name = s(r, "Name");
            // WMI plafonne AdapterRAM à 4 Go : on préfère la valeur du registre.
            let from_reg = name
                .as_ref()
                .and_then(|n| vram.iter().find(|(d, _)| d == n).map(|(_, m)| *m));
            Gpu {
                vram_bytes: from_reg.or_else(|| u(r, "AdapterRAM")),
                driver_version: s(r, "DriverVersion"),
                driver_date: s(r, "DriverDate").map(|d| wmi_date(&d)),
                name,
            }
        })
        .collect()
}

fn memory(c: &WMIConnection) -> Memory {
    let modules: Vec<MemoryModule> = rows(c, "SELECT Manufacturer, PartNumber, Capacity, Speed, ConfiguredClockSpeed, DeviceLocator, BankLabel, SMBIOSMemoryType FROM Win32_PhysicalMemory")
        .iter()
        .map(|r| MemoryModule {
            manufacturer: s(r, "Manufacturer"),
            part_number: s(r, "PartNumber"),
            capacity_bytes: u(r, "Capacity"),
            speed_mts: u(r, "Speed"),
            configured_mts: u(r, "ConfiguredClockSpeed"),
            slot: s(r, "DeviceLocator"),
            bank: s(r, "BankLabel"),
            kind: u(r, "SMBIOSMemoryType").map(memory_kind),
        })
        .collect();
    let arr = first(c, "SELECT MemoryDevices, MaxCapacityEx FROM Win32_PhysicalMemoryArray");
    Memory {
        total_bytes: modules.iter().filter_map(|m| m.capacity_bytes).sum(),
        slots_total: u(&arr, "MemoryDevices"),
        max_capacity_bytes: u(&arr, "MaxCapacityEx").map(|kb| kb * 1024),
        modules,
    }
}

fn board(c: &WMIConnection) -> Board {
    let bb = first(c, "SELECT Manufacturer, Product, Version FROM Win32_BaseBoard");
    let bios = first(c, "SELECT Manufacturer, SMBIOSBIOSVersion, ReleaseDate FROM Win32_BIOS");
    Board {
        manufacturer: s(&bb, "Manufacturer"),
        product: s(&bb, "Product"),
        version: s(&bb, "Version"),
        bios_vendor: s(&bios, "Manufacturer"),
        bios_version: s(&bios, "SMBIOSBIOSVersion"),
        bios_date: s(&bios, "ReleaseDate").map(|d| wmi_date(&d)),
    }
}

fn disks(c: &WMIConnection) -> Vec<Disk> {
    rows(c, "SELECT FriendlyName, MediaType, BusType, Size, HealthStatus FROM MSFT_PhysicalDisk")
        .iter()
        .map(|r| Disk {
            name: s(r, "FriendlyName"),
            media: match u(r, "MediaType") {
                Some(3) => "HDD",
                Some(4) => "SSD",
                Some(5) => "SCM",
                _ => "Inconnu",
            }
            .into(),
            bus: match u(r, "BusType") {
                Some(17) => "NVMe",
                Some(11) => "SATA",
                Some(7) => "USB",
                Some(8) => "RAID",
                Some(10) => "SAS",
                Some(12) => "SD",
                _ => "Autre",
            }
            .into(),
            size_bytes: u(r, "Size"),
            health: match u(r, "HealthStatus") {
                Some(0) => "healthy",
                Some(1) => "warning",
                Some(2) => "unhealthy",
                _ => "unknown",
            }
            .into(),
        })
        .collect()
}

fn volumes(c: &WMIConnection) -> Vec<Volume> {
    // DriveType 3 = disque local
    rows(c, "SELECT DeviceID, VolumeName, FileSystem, Size, FreeSpace FROM Win32_LogicalDisk WHERE DriveType = 3")
        .iter()
        .map(|r| Volume {
            letter: s(r, "DeviceID"),
            label: s(r, "VolumeName"),
            file_system: s(r, "FileSystem"),
            size_bytes: u(r, "Size"),
            free_bytes: u(r, "FreeSpace"),
        })
        .collect()
}

fn monitors(c: &WMIConnection) -> Vec<Monitor> {
    rows(c, "SELECT ManufacturerName, UserFriendlyName, YearOfManufacture FROM WmiMonitorID")
        .iter()
        .map(|r| Monitor {
            maker: chars(r, "ManufacturerName"),
            model: chars(r, "UserFriendlyName"),
            year: u(r, "YearOfManufacture"),
        })
        .collect()
}

fn network(c: &WMIConnection) -> Vec<NetAdapter> {
    // HardwareInterface = TRUE : uniquement les vraies cartes (pas les VPN ni les ponts virtuels)
    rows(c, "SELECT Name, InterfaceDescription, MediaConnectState, Speed, NdisPhysicalMedium FROM MSFT_NetAdapter WHERE HardwareInterface = TRUE")
        .iter()
        .map(|r| NetAdapter {
            name: s(r, "Name"),
            description: s(r, "InterfaceDescription"),
            connected: u(r, "MediaConnectState") == Some(1),
            speed_bps: u(r, "Speed"),
            // NdisPhysicalMedium 9 = Wi-Fi (Native 802.11)
            wireless: u(r, "NdisPhysicalMedium") == Some(9),
        })
        .collect()
}

fn audio(c: &WMIConnection) -> Vec<AudioDevice> {
    rows(c, "SELECT Name, Manufacturer FROM Win32_SoundDevice")
        .iter()
        .map(|r| AudioDevice { name: s(r, "Name"), manufacturer: s(r, "Manufacturer") })
        .collect()
}

/// Résolution et fréquences de chaque écran actif, via l'API d'affichage Windows.
/// C'est la seule source fiable pour savoir si l'écran tourne sous sa fréquence maximale.
fn displays() -> Vec<Display> {
    use windows::core::PCWSTR;
    use windows::Win32::Graphics::Gdi::{
        EnumDisplayDevicesW, EnumDisplaySettingsW, DEVMODEW, DISPLAY_DEVICEW,
        DISPLAY_DEVICE_ATTACHED_TO_DESKTOP, DISPLAY_DEVICE_PRIMARY_DEVICE, ENUM_CURRENT_SETTINGS,
        ENUM_DISPLAY_SETTINGS_MODE,
    };

    let mut out = Vec::new();
    let mut i = 0u32;
    loop {
        let mut dd = DISPLAY_DEVICEW {
            cb: std::mem::size_of::<DISPLAY_DEVICEW>() as u32,
            ..Default::default()
        };
        if !unsafe { EnumDisplayDevicesW(PCWSTR::null(), i, &mut dd, 0) }.as_bool() {
            break;
        }
        i += 1;
        if dd.StateFlags.0 & DISPLAY_DEVICE_ATTACHED_TO_DESKTOP.0 == 0 {
            continue;
        }
        let name = PCWSTR(dd.DeviceName.as_ptr());
        let mut cur = DEVMODEW { dmSize: std::mem::size_of::<DEVMODEW>() as u16, ..Default::default() };
        if !unsafe { EnumDisplaySettingsW(name, ENUM_CURRENT_SETTINGS, &mut cur) }.as_bool() {
            continue;
        }
        let mut max_hz = cur.dmDisplayFrequency;
        let mut m = 0u32;
        loop {
            let mut dm = DEVMODEW { dmSize: std::mem::size_of::<DEVMODEW>() as u16, ..Default::default() };
            if !unsafe { EnumDisplaySettingsW(name, ENUM_DISPLAY_SETTINGS_MODE(m), &mut dm) }.as_bool() {
                break;
            }
            m += 1;
            if dm.dmPelsWidth == cur.dmPelsWidth && dm.dmPelsHeight == cur.dmPelsHeight {
                max_hz = max_hz.max(dm.dmDisplayFrequency);
            }
        }
        out.push(Display {
            device: wide(&dd.DeviceName),
            adapter: wide(&dd.DeviceString),
            primary: dd.StateFlags.0 & DISPLAY_DEVICE_PRIMARY_DEVICE.0 != 0,
            width: cur.dmPelsWidth,
            height: cur.dmPelsHeight,
            current_hz: cur.dmDisplayFrequency,
            max_hz,
        });
    }
    out
}

/// Mémoire vidéo réelle lue dans le registre (nom du pilote, octets).
fn registry_vram() -> Vec<(String, u64)> {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;
    let path = r"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}";
    let Ok(class) = RegKey::predef(HKEY_LOCAL_MACHINE).open_subkey(path) else {
        return vec![];
    };
    class
        .enum_keys()
        .flatten()
        .filter_map(|k| {
            let key = class.open_subkey(&k).ok()?;
            let desc: String = key.get_value("DriverDesc").ok()?;
            let mem: u64 = key.get_value("HardwareInformation.qwMemorySize").ok()?;
            Some((desc, mem))
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Petits utilitaires de conversion
// ---------------------------------------------------------------------------

fn rows(c: &WMIConnection, q: &str) -> Vec<Row> {
    c.raw_query(q).unwrap_or_default()
}

fn first(c: &WMIConnection, q: &str) -> Row {
    rows(c, q).into_iter().next().unwrap_or_default()
}

fn num(v: &Variant) -> Option<u64> {
    match v {
        Variant::UI1(x) => Some(*x as u64),
        Variant::UI2(x) => Some(*x as u64),
        Variant::UI4(x) => Some(*x as u64),
        Variant::UI8(x) => Some(*x),
        Variant::I1(x) => u64::try_from(*x).ok(),
        Variant::I2(x) => u64::try_from(*x).ok(),
        Variant::I4(x) => u64::try_from(*x).ok(),
        Variant::I8(x) => u64::try_from(*x).ok(),
        // WMI renvoie les entiers 64 bits sous forme de texte
        Variant::String(t) => t.trim().parse().ok(),
        _ => None,
    }
}

fn u(r: &Row, k: &str) -> Option<u64> {
    num(r.get(k)?)
}

fn s(r: &Row, k: &str) -> Option<String> {
    match r.get(k)? {
        Variant::String(v) => {
            let t = v.trim();
            (!t.is_empty()).then(|| t.to_string())
        }
        other => num(other).map(|n| n.to_string()),
    }
}

fn b(r: &Row, k: &str) -> Option<bool> {
    match r.get(k)? {
        Variant::Bool(x) => Some(*x),
        _ => None,
    }
}

/// Tableaux de codes de caractères (format utilisé par WmiMonitorID).
fn chars(r: &Row, k: &str) -> Option<String> {
    let Variant::Array(a) = r.get(k)? else { return None };
    let t: String = a
        .iter()
        .filter_map(num)
        .filter(|&n| n != 0)
        .filter_map(|n| char::from_u32(n as u32))
        .collect();
    let t = t.trim().to_string();
    (!t.is_empty()).then_some(t)
}

/// "20201013000000.000000+000" -> "2020-10-13"
fn wmi_date(d: &str) -> String {
    if d.len() >= 8 && d[..8].chars().all(|c| c.is_ascii_digit()) {
        format!("{}-{}-{}", &d[0..4], &d[4..6], &d[6..8])
    } else {
        d.to_string()
    }
}

fn wide(buf: &[u16]) -> String {
    let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    String::from_utf16_lossy(&buf[..end])
}

fn memory_kind(code: u64) -> String {
    match code {
        20 => "DDR",
        21 => "DDR2",
        24 => "DDR3",
        26 => "DDR4",
        27 => "LPDDR",
        28 => "LPDDR2",
        29 => "LPDDR3",
        30 => "LPDDR4",
        34 => "DDR5",
        35 => "LPDDR5",
        _ => "Inconnue",
    }
    .into()
}
