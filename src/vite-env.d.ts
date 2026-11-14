/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Adresse publique de data/prices.json (voir src/upgrade/prices.ts). */
  readonly VITE_PRICES_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
