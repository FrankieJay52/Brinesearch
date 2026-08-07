import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

const releaseHtml = {
  name: 'brinesearch-v17-release-html',
  transformIndexHtml(html) {
    return html
      .replace(/BrineSearch V17 Preview — · Field Pad Directory/g, 'BrineSearch · Field Pad Directory')
      .replace(/<meta\s+name=["']brinesearch-build["']\s+content=["'][^"']*["']\s*\/?>(?=)/i, '<meta name="brinesearch-build" content="17.0.0">');
  }
};

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: 'public',
  plugins: [releaseHtml],
  build: { outDir: '../dist-v17', emptyOutDir: true, target: 'es2020' },
  server: { host: true, port: 4173 }
});
