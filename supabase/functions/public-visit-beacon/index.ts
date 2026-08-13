import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const MAX_BODY_BYTES = 768;
const TRUSTED_GATEWAY_HEADER = "cf-connecting-ip";
const TRUSTED_COUNTRY_HEADER = "cf-ipcountry";
const VERIFIED_HEADER_FLAG = "VISITOR_ANALYTICS_TRUSTED_IP_HEADER";

const PRODUCTION_ORIGINS = new Set([
  "https://brinesearch.com",
  "https://www.brinesearch.com",
  "https://brinesearch.netlify.app",
]);
const PREVIEW_ORIGIN = /^https:\/\/deploy-preview-\d+--brinesearch\.netlify\.app$/i;
const LOCAL_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i;
const ALLOWED_FIELDS = new Set(["session_id", "route", "referrer_origin"]);
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_ROUTE = /^\/[A-Za-z0-9_./:-]{0,179}$/;
const SAFE_HOST = /^[a-z0-9.-]{1,253}$/;

type Mode = "production" | "preview" | "local" | "blocked";
type VisitPayload = {
  session_id: string;
  route: string;
  referrer_origin: string | null;
};

type NetworkIdentity = {
  maskedPrefix: string;
};

function modeForOrigin(origin: string): Mode {
  if (PRODUCTION_ORIGINS.has(origin)) return "production";
  if (PREVIEW_ORIGIN.test(origin)) return "preview";
  if (LOCAL_ORIGIN.test(origin)) return "local";
  return "blocked";
}

function corsHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Cross-Origin-Resource-Policy": "same-site",
    "Vary": "Origin",
  };
}

function response(origin: string, status: number, accepted: boolean): Response {
  return new Response(JSON.stringify({ accepted }), {
    status,
    headers: corsHeaders(origin),
  });
}

function privacySignalEnabled(req: Request): boolean {
  return req.headers.get("sec-gpc") === "1" || req.headers.get("dnt") === "1";
}

function normalizeReferrerOrigin(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > 320) return undefined;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return undefined;
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return undefined;
    if (parsed.pathname !== "/" && parsed.pathname !== "") return undefined;
    const host = parsed.hostname.toLowerCase();
    return SAFE_HOST.test(host) ? host : undefined;
  } catch {
    return undefined;
  }
}

function parsePayload(value: unknown): VisitPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const keys = Object.keys(row);
  if (keys.some((key) => !ALLOWED_FIELDS.has(key))) return null;
  if (keys.length < 2 || keys.length > 3) return null;
  if (typeof row.session_id !== "string" || !UUID_V4.test(row.session_id)) return null;
  if (typeof row.route !== "string" || !SAFE_ROUTE.test(row.route) || row.route.includes("?") || row.route.includes("#")) return null;
  const referrer = normalizeReferrerOrigin(row.referrer_origin);
  if (referrer === undefined) return null;
  return {
    session_id: row.session_id.toLowerCase(),
    route: row.route,
    referrer_origin: referrer,
  };
}

function ipv4Parts(raw: string): number[] | null {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(raw)) return null;
  const parts = raw.split(".").map(Number);
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return parts;
}

function parseIpv4(raw: string): NetworkIdentity | null {
  const parts = ipv4Parts(raw);
  if (!parts) return null;
  return { maskedPrefix: `${parts[0]}.${parts[1]}.${parts[2]}.0/24` };
}

function ipv4TailToHextets(raw: string): [string, string] | null {
  const parts = ipv4Parts(raw);
  if (!parts) return null;
  return [
    ((parts[0] << 8) | parts[1]).toString(16),
    ((parts[2] << 8) | parts[3]).toString(16),
  ];
}

function expandIpv6(raw: string): number[] | null {
  if (!raw || raw.length > 80 || raw.includes("%")) return null;
  let candidate = raw.toLowerCase();
  if (candidate.includes(".")) {
    const lastColon = candidate.lastIndexOf(":");
    if (lastColon < 0) return null;
    const tail = ipv4TailToHextets(candidate.slice(lastColon + 1));
    if (!tail) return null;
    candidate = `${candidate.slice(0, lastColon)}:${tail[0]}:${tail[1]}`;
  }

  if ((candidate.match(/::/g) || []).length > 1) return null;
  const halves = candidate.split("::");
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const valid = (part: string) => /^[0-9a-f]{1,4}$/.test(part);
  if (left.some((part) => !valid(part)) || right.some((part) => !valid(part))) return null;

  const missing = 8 - left.length - right.length;
  if (halves.length === 1 && missing !== 0) return null;
  if (halves.length === 2 && missing < 1) return null;
  const full = [...left, ...Array(Math.max(0, missing)).fill("0"), ...right];
  if (full.length !== 8) return null;
  return full.map((part) => parseInt(part, 16));
}

function parseIpv6(raw: string): NetworkIdentity | null {
  const parts = expandIpv6(raw);
  if (!parts) return null;
  const maskedPrefix = `${parts[0].toString(16)}:${parts[1].toString(16)}:${parts[2].toString(16)}::/48`;
  return { maskedPrefix };
}

function networkIdentity(raw: string): NetworkIdentity | null {
  const value = raw.trim().toLowerCase();
  if (!value || value.includes(",") || value.length > 128) return null;
  return parseIpv4(value) || parseIpv6(value);
}

async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function coarseFamilies(userAgent: string): {
  device: "mobile" | "tablet" | "desktop" | "other";
  browser: "Safari" | "Chrome" | "Edge" | "Firefox" | "Samsung Internet" | "Bot" | "Other";
  os: "iOS" | "Android" | "Windows" | "macOS" | "ChromeOS" | "Linux" | "Other";
} {
  const ua = userAgent.slice(0, 1024);
  const bot = /bot|crawler|spider|slurp|facebookexternalhit|bingpreview|headless|lighthouse/i.test(ua);
  const tablet = /ipad|tablet|kindle|silk/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua));
  const mobile = !tablet && /iphone|ipod|android|mobile|windows phone/i.test(ua);
  const device = bot ? "other" : tablet ? "tablet" : mobile ? "mobile" : ua ? "desktop" : "other";

  let browser: "Safari" | "Chrome" | "Edge" | "Firefox" | "Samsung Internet" | "Bot" | "Other" = "Other";
  if (bot) browser = "Bot";
  else if (/SamsungBrowser/i.test(ua)) browser = "Samsung Internet";
  else if (/EdgA?\//i.test(ua) || /EdgiOS/i.test(ua)) browser = "Edge";
  else if (/Firefox\//i.test(ua) || /FxiOS/i.test(ua)) browser = "Firefox";
  else if (/Chrome\//i.test(ua) || /CriOS/i.test(ua)) browser = "Chrome";
  else if (/Safari\//i.test(ua)) browser = "Safari";

  let os: "iOS" | "Android" | "Windows" | "macOS" | "ChromeOS" | "Linux" | "Other" = "Other";
  if (/iphone|ipad|ipod/i.test(ua)) os = "iOS";
  else if (/android/i.test(ua)) os = "Android";
  else if (/windows nt|windows phone/i.test(ua)) os = "Windows";
  else if (/cros/i.test(ua)) os = "ChromeOS";
  else if (/macintosh|mac os x/i.test(ua)) os = "macOS";
  else if (/linux/i.test(ua)) os = "Linux";
  return { device, browser, os };
}

function gatewayCountry(req: Request): string | null {
  const country = (req.headers.get(TRUSTED_COUNTRY_HEADER) || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(country) ? country : null;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  const mode = modeForOrigin(origin);

  if (req.method === "OPTIONS") {
    if (mode === "blocked") return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (mode === "blocked") return response(origin || "null", 403, false);
  if (req.method !== "POST") return response(origin, 405, false);

  const contentLength = Number(req.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) return response(origin, 413, false);

  let text = "";
  try {
    text = await req.text();
  } catch {
    return response(origin, 400, false);
  }
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return response(origin, 413, false);

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(text);
  } catch {
    return response(origin, 400, false);
  }
  const payload = parsePayload(parsedBody);
  if (!payload) return response(origin, 400, false);

  // Preview/local traffic is intentionally non-writing. Privacy signals are honored
  // in the Edge Function too, so a modified client cannot bypass the browser check.
  if (mode !== "production" || privacySignalEnabled(req)) return response(origin, 202, true);

  // Release gate: production collection remains fail-closed until a controlled live
  // test proves which gateway header is authoritative/overwrites client input. The
  // verified value must be explicitly configured after that test.
  const verifiedHeader = (Deno.env.get(VERIFIED_HEADER_FLAG) || "").trim().toLowerCase();
  if (verifiedHeader !== TRUSTED_GATEWAY_HEADER) return response(origin, 202, true);

  const network = networkIdentity(req.headers.get(TRUSTED_GATEWAY_HEADER) || "");
  if (!network) return response(origin, 202, true);

  const hmacSecret = Deno.env.get("VISITOR_ANALYTICS_HMAC_SECRET") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  // The recording RPC explicitly checks a service-role JWT claim. This server-only
  // client is created inside the Edge Function and is never exposed to browser code.
  const serviceRoleJwt = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (hmacSecret.length < 32 || !supabaseUrl || !serviceRoleJwt) return response(origin, 202, true);

  // HMAC the masked network, not the full address. This deliberately makes the
  // estimate coarser and removes the exact address from memory as early as practical.
  const networkHmac = await hmacHex(hmacSecret, `network:${network.maskedPrefix}`);
  const displayDigest = await hmacHex(hmacSecret, `display:${networkHmac}`);
  const visitorCode = `V-${displayDigest.slice(0, 10).toUpperCase()}`;
  const families = coarseFamilies(req.headers.get("user-agent") || "");
  const referrerHost = payload.referrer_origin;

  try {
    const serviceClient = createClient(supabaseUrl, serviceRoleJwt, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init = {}) => fetch(input, { ...init, signal: AbortSignal.timeout(1500) }),
      },
    });
    await serviceClient.rpc("record_visitor_event_issue101", {
      p_session_id: payload.session_id,
      p_network_hmac: networkHmac,
      p_network_prefix: network.maskedPrefix,
      p_visitor_code: visitorCode,
      p_route: payload.route,
      p_referrer_host: referrerHost,
      p_country_code: gatewayCountry(req),
      p_device_family: families.device,
      p_browser_family: families.browser,
      p_os_family: families.os,
    });
  } catch {
    // Analytics is best-effort. Never log request data or make an app visit fail.
  }

  // Do not expose visitor identifiers, rate-limit state, or internal failures.
  return response(origin, 202, true);
});