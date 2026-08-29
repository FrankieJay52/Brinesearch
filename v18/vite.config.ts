import { fileURLToPath, URL } from "node:url";
import { readFile } from "node:fs/promises";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const release = "18.0.0";
const defaultBuildBase = "/v18/";
const mapLibreWorkerFiles = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"] as const;

function mapLibreWorkerAssets(): Plugin {
  return {
    name: "brinesearch-maplibre-worker-assets",
    apply: "build",
    async buildStart() {
      for (const fileName of mapLibreWorkerFiles) {
        this.emitFile({
          type: "asset",
          fileName: `maplibre/${fileName}`,
          source: await readFile(new URL(`./node_modules/maplibre-gl/dist/${fileName}`, import.meta.url)),
        });
      }
    },
  };
}

function normalizedBase(value: string | undefined) {
  const candidate = value?.trim() || defaultBuildBase;
  const path = candidate.replace(/^\/+|\/+$/g, "");
  return path ? `/${path}/` : "/";
}

export default defineConfig(({ command, isPreview }) => {
  const base = command === "serve" && !isPreview ? "/" : normalizedBase(process.env.VITE_V18_BASE_PATH);
  return {
  base,
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [
    mapLibreWorkerAssets(),
    react(),
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      manifest: {
        name: "BrineSearch",
        short_name: "BrineSearch",
        description: "Field map, pad directory, and route readiness.",
        theme_color: "#07131f",
        background_color: "#07131f",
        display: "standalone",
        id: base,
        start_url: `${base}#/`,
        scope: base,
        icons: [
          { src: `${base}brinesearch-icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
          { src: `${base}brinesearch-icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
          { src: `${base}brinesearch-icon-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: `${base}brinesearch-icon.svg`, sizes: "any", type: "image/svg+xml", purpose: "any" },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: `${base}index.html`,
        // The lazy, gzip-compressed Ascent field-route catalog is about 421 KB
        // over the wire but exceeds Workbox's 2 MiB raw-file default. Keep the
        // bounded 4 MiB ceiling so the inspected road names remain available
        // offline without relaxing the cache limit for arbitrarily large files.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        globPatterns: ["**/*.{js,mjs,wasm,css,html,svg,png,webp,woff2}"],
        globIgnores: [
          "**/owner-google-verify-google-runtime-*.js",
          "**/OwnerGoogleVerifyMapPage-*.js",
          "**/OwnerGoogleVerifyMapPage-*.css",
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  define: {
    __BRINESEARCH_VERSION__: JSON.stringify(release),
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: {
    outDir: "../dist-v18",
    emptyOutDir: true,
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("googleMapsLoader")) return "owner-google-verify-google-runtime";
          if (id.includes("maplibre-gl")) return "maplibre";
          if (id.includes("pad-fallback-data.json")) return "directory-fallback";
          if (id.includes("react-router") || id.includes("react-dom") || id.includes("/react/")) return "react-vendor";
          return undefined;
        },
      },
    },
  },
  server: { host: true, port: 4180 },
  preview: { host: true, port: 4181 },
  };
});
