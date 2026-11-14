import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Configuration attendue par Tauri : port fixe, pas d'effacement de la console,
// et on ignore le dossier Rust pour ne pas recharger l'interface à chaque compilation.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    // Le projet est dans OneDrive : la surveillance native rate parfois des modifications,
    // la scrutation (polling) est plus fiable.
    watch: { ignored: ["**/src-tauri/**"], usePolling: true, interval: 300 },
  },
});
