import "jsr:@supabase/functions-js/edge-runtime.d.ts";

function firstConfiguredKey(raw: string | undefined, legacy: string | undefined): string {
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const preferred = parsed.default;
      if (typeof preferred === "string" && preferred) return preferred;
      const candidate = Object.values(parsed).find((value) => typeof value === "string" && value);
      if (typeof candidate === "string") return candidate;
    } catch {
      if (raw.startsWith("sb_")) return raw;
    }
  }
  return legacy || "";
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, if-none-match, x-client-info, apikey, authorization",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Cross-Origin-Resource-Policy": "cross-origin",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "GET") return Response.json({ error: "Method not allowed." }, { status: 405, headers: cors });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const publishableKey = firstConfiguredKey(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"), Deno.env.get("SUPABASE_ANON_KEY"));
  if (!supabaseUrl || !publishableKey) return Response.json({ error: "Directory unavailable." }, { status: 503, headers: cors });

  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") || "1000") || 1000, 1000));
  const offset = Math.max(0, Number(url.searchParams.get("offset") || "0") || 0);
  const source = new URL(`${supabaseUrl}/rest/v1/public_pad_directory_summary`);
  source.searchParams.set("select", "*");
  source.searchParams.set("order", "record_number.asc.nullslast,pad_name.asc");
  source.searchParams.set("limit", String(limit));
  source.searchParams.set("offset", String(offset));

  const upstream = await fetch(source, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!upstream.ok) return Response.json({ error: "Directory unavailable." }, { status: 502, headers: cors });

  const text = await upstream.text();
  const etag = `"${await sha256Hex(text)}"`;
  const headers = new Headers(cors);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "public, max-age=300, s-maxage=900, stale-while-revalidate=3600");
  headers.set("CDN-Cache-Control", "public, s-maxage=900, stale-while-revalidate=3600");
  headers.set("ETag", etag);
  headers.set("Vary", "Accept-Encoding");

  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(text, { status: 200, headers });
});
