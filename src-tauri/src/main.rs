// Masque la console noire en version finale.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod live;
mod scan;

fn main() {
    // Diagnostic : `pcevolu.exe --scan-json` affiche le rapport complet sans ouvrir de fenêtre.
    if std::env::args().any(|a| a == "--scan-json") {
        match scan::collect() {
            Ok(r) => println!("{}", serde_json::to_string_pretty(&r).unwrap_or_default()),
            Err(e) => eprintln!("{e}"),
        }
        return;
    }

    tauri::Builder::default()
        .manage(live::LiveState::default())
        .invoke_handler(tauri::generate_handler![scan::scan, live::metrics])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de PCEvolu");
}
