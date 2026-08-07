import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

const releaseHtml = {
  name: 'brinesearch-v17-release-html',
  transformIndexHtml(html) {
    return html
      .replace(/BrineSearch V17 Preview — · Field Pad Directory/g, 'BrineSearch · Field Pad Directory')
      .replace(/<meta\s+name=["']brinesearch-build["']\s+content=["'][^"']*["']\s*\/?>(?=)/i, '<meta name="brinesearch-build" content="17.3.0">')
      .replace(/(<link\s+rel=["']stylesheet["']\s+href=["']\/styles\/app\.css[^"']*["']\s*>)/i, '$1\n<link rel="stylesheet" href="/styles/field-mark-icons.css?v=17.3.0">')
      .replace(/<link\s+rel=["']apple-touch-icon["']\s+sizes=["']180x180["']\s+href=["']\.\/brand-kit\/brinesearch-apple-touch-icon\.png["']\s*\/?>/i, '')
      .replace(/<div class="legal-footer-brand" aria-label="BrineSearch"><img class="footer-logo footer-logo-dark"[^>]*><img class="footer-logo footer-logo-day"[^>]*><\/div>/i, '<div class="legal-footer-brand" aria-label="BrineSearch"><span class="fm-icon fm-pad" aria-hidden="true"></span><strong>BrineSearch</strong></div>')
      .replace(/ · V 16\.21<\/div>/g, ' · V 17.3</div>')
      .replace(/<script\s+src=["']\/v16-25-hotfix\.js[^"']*["']><\/script>/i, '<script src="/app/front-sign-structured.js?v=17.3.0"></script>\n<script src="/app/front-sign-hidden.js?v=17.3.0"></script>')
      .replaceAll('?v=17.0.0', '?v=17.3.0');
  }
};

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: 'public',
  plugins: [releaseHtml],
  build: { outDir: '../dist-v17', emptyOutDir: true, target: 'es2020' },
  server: { host: true, port: 4173 }
});
