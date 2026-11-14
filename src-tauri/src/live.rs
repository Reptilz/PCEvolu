//! Mesures en temps réel (charge CPU, RAM, GPU), appelées toutes les 2 secondes par l'interface.

use serde::Serialize;
use std::sync::Mutex;
use sysinfo::System;

pub struct LiveState(Mutex<Option<System>>);

impl Default for LiveState {
    fn default() -> Self {
        let sys = System::new().ok().map(|mut s| {
            // Première mesure : la charge CPU se calcule entre deux relevés.
            s.refresh_cpu_usage();
            s.refresh_memory();
            s
        });
        LiveState(Mutex::new(sys))
    }
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Metrics {
    pub cpu_percent: Option<f32>,
    pub ram_used_bytes: Option<u64>,
    pub ram_total_bytes: Option<u64>,
    pub uptime_secs: Option<u64>,
    pub gpu: Option<GpuLive>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GpuLive {
    pub temp_c: Option<f32>,
    pub usage_percent: Option<f32>,
    pub vram_used_mb: Option<f32>,
    pub vram_total_mb: Option<f32>,
    pub power_w: Option<f32>,
}

#[tauri::command]
pub async fn metrics(state: tauri::State<'_, LiveState>) -> Result<Metrics, String> {
    let mut m = Metrics { uptime_secs: System::uptime().ok(), ..Default::default() };
    {
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        if let Some(sys) = guard.as_mut() {
            sys.refresh_cpu_usage();
            sys.refresh_memory();
            m.cpu_percent = Some(sys.global_cpu_usage());
            m.ram_used_bytes = Some(sys.used_memory());
            m.ram_total_bytes = Some(sys.total_memory());
        }
    }
    m.gpu = tauri::async_runtime::spawn_blocking(nvidia_live).await.ok().flatten();
    Ok(m)
}

/// Cartes NVIDIA : on interroge nvidia-smi (installé avec le pilote) sans ouvrir de console.
fn nvidia_live() -> Option<GpuLive> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let out = std::process::Command::new("nvidia-smi")
        .args([
            "--query-gpu=temperature.gpu,utilization.gpu,memory.used,memory.total,power.draw",
            "--format=csv,noheader,nounits",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let line = text.lines().next()?;
    let v: Vec<Option<f32>> = line.split(',').map(|p| p.trim().parse().ok()).collect();
    let at = |i: usize| v.get(i).copied().flatten();
    Some(GpuLive {
        temp_c: at(0),
        usage_percent: at(1),
        vram_used_mb: at(2),
        vram_total_mb: at(3),
        power_w: at(4),
    })
}
