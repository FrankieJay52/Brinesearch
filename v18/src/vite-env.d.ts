/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __BRINESEARCH_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
