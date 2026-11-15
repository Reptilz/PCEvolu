//! Onglet « Optimiser » : programmes au démarrage, processus en cours et réglages Windows utiles au jeu.
//!
//! - Démarrage : mêmes sources que le Gestionnaire des tâches (clés Run du registre et dossiers Démarrage), avec
//!   leur état activé / désactivé lu dans « StartupApproved ». Activer / désactiver écrit au même endroit que le
//!   Gestionnaire des tâches : c'est réversible et ne supprime rien.
//! - Processus : regroupés par nom, avec la charge processeur et la mémoire utilisée.
//! - Réglages : mode d'alimentation, mode Jeu, planification GPU matérielle, taille des fichiers temporaires.

use serde::Serialize;
use std::collections::HashMap;
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, KEY_SET_VALUE, KEY_WOW64_64KEY};
use winreg::{RegKey, RegValue};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const RUN: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const RUN32: &str = r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run";
const APPROVED: &str = r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupItem {
    pub name: String,
    pub command: String,
    /// "user-run", "machine-run", "machine-run32", "user-folder", "common-folder"
    pub location: String,
    pub enabled: bool,
    /// Modifiable sans droits administrateur (entrées de l'utilisateur).
    pub user_scope: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessGroup {
    pub name: String,
    pub count: u32,
    /// Part de la puissance totale du processeur (0-100).
    pub cpu_percent: f32,
    pub memory_bytes: u64,
    pub exe: Option<String>,
    /// Fermeture refusée (élément de Windows ou de PCEvolu).
    pub protected: bool,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Tweaks {
    pub power_plan_guid: Option<String>,
    pub power_plan_name: Option<String>,
    pub game_mode: Option<bool>,
    pub hags: Option<bool>,
    pub temp_bytes: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OptimizeReport {
    pub startup: Vec<StartupItem>,
    pub processes: Vec<ProcessGroup>,
    pub tweaks: Tweaks,
    pub ram_total_bytes: u64,
    pub ram_used_bytes: u64,
}

#[tauri::command]
pub async fn optimize_scan() -> Result<OptimizeReport, String> {
    tauri::async_runtime::spawn_blocking(collect).await.map_err(|e| e.to_string())
}

pub fn collect() -> OptimizeReport {
    let (processes, ram_total, ram_used) = processes();
    OptimizeReport { startup: startup_items(), processes, tweaks: tweaks(), ram_total_bytes: ram_total, ram_used_bytes: ram_used }
}

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------

/// État lu dans StartupApproved : premier octet pair (02, 06) = activé, impair (01, 03) = désactivé ; absent = activé.
fn approved(root: &RegKey, sub: &str, name: &str) -> bool {
    root.open_subkey_with_flags(format!(r"{APPROVED}\{sub}"), KEY_READ)
        .ok()
        .and_then(|k| k.get_raw_value(name).ok())
        .and_then(|v| v.bytes.first().copied())
        .map(|b| b % 2 == 0)
        .unwrap_or(true)
}

fn run_key(out: &mut Vec<StartupItem>, root: &RegKey, path: &str, location: &str, approved_sub: &str, user: bool) {
    let Ok(key) = root.open_subkey_with_flags(path, KEY_READ | KEY_WOW64_64KEY) else { return };
    for (name, _) in key.enum_values().flatten() {
        let command: String = key.get_value(&name).unwrap_or_default();
        if name.is_empty() || command.is_empty() {
            continue;
        }
        let enabled = approved(root, approved_sub, &name);
        out.push(StartupItem { name, command, location: location.into(), enabled, user_scope: user });
    }
}

fn startup_folder(dir: Option<PathBuf>) -> Vec<(String, String)> {
    let Some(dir) = dir else { return vec![] };
    let Ok(rd) = std::fs::read_dir(&dir) else { return vec![] };
    rd.flatten()
        .filter(|e| e.file_name().to_string_lossy().to_lowercase() != "desktop.ini")
        .map(|e| (e.file_name().to_string_lossy().into_owned(), e.path().to_string_lossy().into_owned()))
        .collect()
}

fn startup_items() -> Vec<StartupItem> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let mut out = Vec::new();
    run_key(&mut out, &hkcu, RUN, "user-run", "Run", true);
    run_key(&mut out, &hklm, RUN, "machine-run", "Run", false);
    run_key(&mut out, &hklm, RUN32, "machine-run32", "Run32", false);
    let appdata = std::env::var_os("APPDATA").map(|a| PathBuf::from(a).join(r"Microsoft\Windows\Start Menu\Programs\Startup"));
    let progdata = std::env::var_os("PROGRAMDATA").map(|a| PathBuf::from(a).join(r"Microsoft\Windows\Start Menu\Programs\StartUp"));
    for (file, path) in startup_folder(appdata) {
        let enabled = approved(&hkcu, "StartupFolder", &file);
        out.push(StartupItem { name: file, command: path, location: "user-folder".into(), enabled, user_scope: true });
    }
    for (file, path) in startup_folder(progdata) {
        let enabled = approved(&hklm, "StartupFolder", &file);
        out.push(StartupItem { name: file, command: path, location: "common-folder".into(), enabled, user_scope: false });
    }
    out
}

/// Active ou désactive un programme au démarrage, exactement comme le Gestionnaire des tâches (StartupApproved).
#[tauri::command]
pub fn set_startup_enabled(name: String, location: String, enabled: bool) -> Result<(), String> {
    let (root, sub) = match location.as_str() {
        "user-run" => (RegKey::predef(HKEY_CURRENT_USER), "Run"),
        "user-folder" => (RegKey::predef(HKEY_CURRENT_USER), "StartupFolder"),
        "machine-run" => (RegKey::predef(HKEY_LOCAL_MACHINE), "Run"),
        "machine-run32" => (RegKey::predef(HKEY_LOCAL_MACHINE), "Run32"),
        "common-folder" => (RegKey::predef(HKEY_LOCAL_MACHINE), "StartupFolder"),
        _ => return Err("Emplacement inconnu.".into()),
    };
    let (key, _) = root
        .create_subkey_with_flags(format!(r"{APPROVED}\{sub}"), KEY_SET_VALUE)
        .map_err(|_| "Ce programme est installé pour tous les utilisateurs : il faut les droits administrateur. Passe par le Gestionnaire des tâches (onglet Démarrage).".to_string())?;
    // 12 octets : 02 = activé, 03 = désactivé ; les 8 derniers octets donnent la date de désactivation (FILETIME).
    let mut bytes = vec![if enabled { 2u8 } else { 3u8 }, 0, 0, 0];
    let filetime: u64 = if enabled {
        0
    } else {
        let unix = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
        (unix + 11_644_473_600) * 10_000_000
    };
    bytes.extend_from_slice(&filetime.to_le_bytes());
    key.set_raw_value(&name, &RegValue { bytes: bytes.into(), vtype: winreg::enums::RegType::REG_BINARY })
        .map_err(|_| "Impossible de modifier ce programme : il faut peut-être les droits administrateur. Passe par le Gestionnaire des tâches (onglet Démarrage).".to_string())
}

// ---------------------------------------------------------------------------
// Processus
// ---------------------------------------------------------------------------

fn processes() -> (Vec<ProcessGroup>, u64, u64) {
    use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, RefreshKind, System};
    let Ok(mut sys) = System::new_with_specifics(RefreshKind::nothing().with_processes(ProcessRefreshKind::everything())) else {
        return (vec![], 0, 0);
    };
    // La charge processeur se mesure entre deux relevés.
    std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL.max(std::time::Duration::from_millis(400)));
    sys.refresh_processes(ProcessesToUpdate::All, true);
    sys.refresh_memory();
    let cores = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1) as f32;
    let mut groups: HashMap<String, ProcessGroup> = HashMap::new();
    for p in sys.processes().values() {
        let raw = p.name().to_string_lossy().into_owned();
        let name = raw.trim_end_matches(".exe").trim_end_matches(".EXE").to_string();
        if name.is_empty() || name == "System Idle Process" || name == "Idle" {
            continue;
        }
        let g = groups.entry(name.to_lowercase()).or_insert_with(|| ProcessGroup {
            name: name.clone(),
            count: 0,
            cpu_percent: 0.0,
            memory_bytes: 0,
            exe: p.exe().map(|e| e.to_string_lossy().into_owned()),
            protected: is_protected(&name),
        });
        g.count += 1;
        g.cpu_percent += p.cpu_usage() / cores;
        g.memory_bytes += p.memory();
    }
    let mut list: Vec<ProcessGroup> = groups.into_values().collect();
    list.sort_by(|a, b| b.memory_bytes.cmp(&a.memory_bytes));
    list.truncate(60);
    (list, sys.total_memory(), sys.used_memory())
}

// ---------------------------------------------------------------------------
// Réglages Windows
// ---------------------------------------------------------------------------

fn tweaks() -> Tweaks {
    let mut t = Tweaks::default();
    // Mode d'alimentation actif : « GUID ... : 381b4222-... (Équilibré) ».
    if let Ok(out) = std::process::Command::new("powercfg").arg("/getactivescheme").creation_flags(CREATE_NO_WINDOW).output() {
        let text = String::from_utf8_lossy(&out.stdout).into_owned();
        let text = if text.trim().is_empty() { decode_oem(&out.stdout) } else { text };
        if let Some(i) = text.find(':') {
            let rest = text[i + 1..].trim();
            t.power_plan_guid = rest.split_whitespace().next().map(|s| s.to_lowercase());
            if let (Some(a), Some(b)) = (rest.find('('), rest.rfind(')')) {
                t.power_plan_name = Some(rest[a + 1..b].to_string());
            }
        }
    }
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    // Mode Jeu : activé par défaut sur Windows 10/11 quand la valeur n'existe pas.
    t.game_mode = Some(
        hkcu.open_subkey(r"Software\Microsoft\GameBar")
            .ok()
            .and_then(|k| k.get_value::<u32, _>("AutoGameModeEnabled").ok())
            .map(|v| v != 0)
            .unwrap_or(true),
    );
    // Planification GPU à accélération matérielle : HwSchMode = 2 (activée) ou 1 (désactivée).
    t.hags = RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey(r"SYSTEM\CurrentControlSet\Control\GraphicsDrivers")
        .ok()
        .and_then(|k| k.get_value::<u32, _>("HwSchMode").ok())
        .map(|v| v == 2);
    t.temp_bytes = std::env::var_os("TEMP").map(|d| dir_size(&PathBuf::from(d), 0));
    t
}

/// powercfg écrit dans la page de code OEM de la console (850 en France) : décodage simple des accents courants.
fn decode_oem(bytes: &[u8]) -> String {
    bytes.iter().map(|&b| match b {
        0x82 => 'é', 0x8A => 'è', 0x88 => 'ê', 0x85 => 'à', 0x87 => 'ç', 0x90 => 'É', 0x8C => 'î', 0x93 => 'ô', 0x97 => 'ù',
        _ => b as char,
    }).collect()
}

fn dir_size(dir: &PathBuf, depth: u32) -> u64 {
    if depth > 6 {
        return 0;
    }
    let Ok(rd) = std::fs::read_dir(dir) else { return 0 };
    rd.flatten()
        .map(|e| match e.metadata() {
            Ok(m) if m.is_dir() => dir_size(&e.path(), depth + 1),
            Ok(m) => m.len(),
            Err(_) => 0,
        })
        .sum()
}

/// Ouvre un écran de Windows (liste fermée : pas de commande arbitraire).
#[tauri::command]
pub fn open_system(target: String) -> Result<(), String> {
    let temp;
    // Pour chaque écran : le lien Paramètres, puis l'outil classique équivalent quand il existe, et enfin le chemin
    // à suivre à la main. Sur certains PC, Windows refuse d'ouvrir les liens ms-settings: (erreur 0xD0000034).
    let (attempts, manual): (Vec<Vec<&str>>, &str) = match target.as_str() {
        "taskmgr" => (vec![vec!["taskmgr"]], "Ctrl + Maj + Échap"),
        "startup" => (vec![vec!["ms-settings:startupapps"], vec!["taskmgr", "/0", "/startup"]], "Paramètres > Applications > Démarrage"),
        "gamemode" => (vec![vec!["ms-settings:gaming-gamemode"]], "Paramètres > Jeux > Mode Jeu"),
        "graphics" => (vec![vec!["ms-settings:display-advancedgraphics"]], "Paramètres > Système > Écran > Graphiques"),
        "power" => (vec![vec!["ms-settings:powersleep"], vec!["control.exe", "powercfg.cpl"]], "Paramètres > Système > Alimentation"),
        "storage" => (vec![vec!["ms-settings:storagesense"], vec!["cleanmgr.exe"]], "Paramètres > Système > Stockage"),
        "temp" => {
            temp = std::env::var("TEMP").map_err(|e| e.to_string())?;
            (vec![vec![temp.as_str()]], "%TEMP%")
        }
        _ => return Err("Écran inconnu.".into()),
    };
    for args in attempts {
        let params = args[1..].join(" ");
        if shell_open(args[0], &params) {
            return Ok(());
        }
    }
    Err(format!("Windows n'a pas voulu ouvrir ce réglage. Tu le trouveras ici : {manual}."))
}

/// Ouvre un fichier, un programme ou un lien comme un double-clic (ShellExecuteEx), sans afficher la boîte
/// d'erreur de Windows en cas d'échec : on renvoie simplement false pour essayer la solution suivante.
fn shell_open(file: &str, params: &str) -> bool {
    use windows::core::PCWSTR;
    use windows::Win32::UI::Shell::{ShellExecuteExW, SEE_MASK_FLAG_NO_UI, SEE_MASK_NOASYNC, SHELLEXECUTEINFOW};
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
    let wide = |s: &str| s.encode_utf16().chain(std::iter::once(0)).collect::<Vec<u16>>();
    let f = wide(file);
    let p = wide(params);
    let mut info = SHELLEXECUTEINFOW {
        cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
        fMask: SEE_MASK_FLAG_NO_UI | SEE_MASK_NOASYNC,
        lpFile: PCWSTR(f.as_ptr()),
        lpParameters: if params.is_empty() { PCWSTR::null() } else { PCWSTR(p.as_ptr()) },
        nShow: SW_SHOWNORMAL.0,
        ..Default::default()
    };
    unsafe { ShellExecuteExW(&mut info).is_ok() }
}

/// Processus qu'on ne ferme jamais : Windows en dépend (fermer l'un d'eux peut figer ou redémarrer le PC),
/// ou PCEvolu lui-même (son interface tourne dans WebView2).
const PROTECTED: &[&str] = &[
    "system", "registry", "memory compression", "smss", "csrss", "wininit", "winlogon", "services", "lsass", "lsaiso",
    "svchost", "dwm", "explorer", "fontdrvhost", "sihost", "taskhostw", "ctfmon", "spoolsv", "audiodg", "conhost",
    "runtimebroker", "startmenuexperiencehost", "shellexperiencehost", "searchhost", "searchindexer", "textinputhost",
    "msmpeng", "nissrv", "securityhealthservice", "securityhealthsystray", "smartscreen", "wudfhost", "dllhost",
    "msedgewebview2", "pcevolu",
];

pub fn is_protected(name: &str) -> bool {
    let n = name.to_lowercase();
    let n = n.trim_end_matches(".exe");
    PROTECTED.contains(&n)
}

/// Ferme tous les processus portant ce nom (comme « Fin de tâche » du Gestionnaire des tâches).
/// Renvoie le nombre de processus fermés. Les processus protégés sont refusés.
#[tauri::command]
pub fn end_process(name: String) -> Result<u32, String> {
    use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, RefreshKind, System};
    if is_protected(&name) {
        return Err(format!("{name} fait partie de Windows (ou de PCEvolu) : le fermer pourrait bloquer le PC."));
    }
    let mut sys = System::new_with_specifics(RefreshKind::nothing().with_processes(ProcessRefreshKind::nothing()))
        .map_err(|e| e.to_string())?;
    sys.refresh_processes(ProcessesToUpdate::All, true);
    let target = name.to_lowercase();
    let me = std::process::id();
    let mut closed = 0u32;
    let mut refused = 0u32;
    for (pid, p) in sys.processes() {
        let n = p.name().to_string_lossy().to_lowercase();
        if n.trim_end_matches(".exe") != target || pid.as_u32() == me {
            continue;
        }
        if p.kill() {
            closed += 1;
        } else {
            refused += 1;
        }
    }
    if closed == 0 && refused > 0 {
        return Err(format!("Windows a refusé de fermer {name} : il tourne probablement avec les droits administrateur. Passe par le Gestionnaire des tâches."));
    }
    if closed == 0 {
        return Err(format!("{name} n'est plus en cours d'exécution."));
    }
    Ok(closed)
}
