/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Adresse publique de data/prices.json (voir src/upgrade/prices.ts). */
  readonly VITE_PRICES_URL?: string;
  /** Adresse publique de data/catalog.json (voir src/upgrade/catalog-remote.ts). */
  readonly VITE_CATALOG_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
