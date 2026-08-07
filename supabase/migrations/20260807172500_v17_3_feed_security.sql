[build]
  command = "npm run build"
  publish = "dist-v17"

[build.environment]
  NODE_VERSION = "22"

[[headers]]
  for = "/*"
  [headers.values]
    X-Content-Type-Options = "nosniff"
    X-Frame-Options = "DENY"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Permissions-Policy = "camera=(self), geolocation=(self), microphone=()"
    Cross-Origin-Opener-Policy = "same-origin"
    Content-Security-Policy = "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' https://cdn.jsdelivr.net 'unsafe-eval' 'wasm-unsafe-eval'; worker-src 'self' blob: https://cdn.jsdelivr.net; connect-src 'self' https://wvxzqtoiwhrgovzddtvz.supabase.co https://api.open-meteo.com https://api.bigdatacloud.net https://cdn.jsdelivr.net https://tessdata.projectnaptha.com; img-src 'self' data: blob: https://wvxzqtoiwhrgovzddtvz.supabase.co; style-src 'self' 'unsafe-inline'; font-src 'self'; manifest-src 'self'; upgrade-insecure-requests"

[[headers]]
  for = "/index.html"
  [headers.values]
    Cache-Control = "no-cache, no-store, must-revalidate"

[[headers]]
  for = "/sw.js"
  [headers.values]
    Cache-Control = "no-cache, no-store, must-revalidate"
    Service-Worker-Allowed = "/"

[[headers]]
  for = "/app/*"
  [headers.values]
    Cache-Control = "public, max-age=3600, must-revalidate"

[[headers]]
  for = "/styles/*"
  [headers.values]
    Cache-Control = "public, max-age=3600, must-revalidate"

[[headers]]
  for = "/icons/*"
  [headers.values]
    Cache-Control = "public, max-age=604800, immutable"

[[headers]]
  for = "/brand-kit/*"
  [headers.values]
    Cache-Control = "public, max-age=604800, immutable"
