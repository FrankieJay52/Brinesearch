import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const TEST_SITE_KEY = "1x00000000000000000000AA";
const TEST_SECRET_KEY = "1x0000000000000000000000000000000AA";
const TURNSTILE_ACTION = "public_pad_submission";
const MAX_BODY_BYTES = 65_536;
const MAX_WELLS = 25;

const PRODUCTION_ORIGINS = new Set([
  "https://brinesearch.com",
  "https://www.brinesearch.com",
  "https://brinesearch.netlify.app",
]);
const PRODUCTION_HOSTNAMES = new Set([
  "brinesearch.com",
  "www.brinesearch.com",
  "brinesearch.netlify.app",
]);
const PREVIEW_ORIGIN = /^https:\/\/deploy-preview-\d+--brinesearch\.netlify\.app$/i;
const LOCAL_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i;

type Mode = "production" | "preview" | "local" | "blocked";

type TurnstileResult = {
  success?: boolean;
  hostname?: string;
  action?: string;
  challenge_ts?: string;
  "error-codes"?: string[];
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
    "Access-Control-Allow-Headers": "content-type, x-client-info, apikey, authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Cross-Origin-Resource-Policy": "same-site",
    "Vary": "Origin",
  };
}

function response(origin: string, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(origin),
  });
}

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

function clientIp(req: Request): string {
  const direct = req.headers.get("cf-connecting-ip") || req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-real-ip");
  if (direct) return direct.trim().toLowerCase().slice(0, 128);
  const forwarded = req.headers.get("x-forwarded-for");
  return (forwarded?.split(",")[0]?.trim().toLowerCase() || "unknown").slice(0, 128);
}

function normalizeIdentity(payload: Record<string, unknown>): string {
  const fields = [
    payload.p_company,
    payload.p_state,
    payload.p_pad_name,
    payload.p_submitter_contact || payload.p_submitter_name,
  ];
  return fields
    .map((value) => String(value ?? "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " "))
    .join("|")
    .slice(0, 1200);
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

function limitedText(value: unknown, max: number): boolean {
  return String(value ?? "").length <= max;
}

function validatePayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "Invalid submission.";
  const p = payload as Record<string, unknown>;
  const recordType = String(p.p_record_type ?? "pad").trim().toLowerCase();
  if (!new Set(["pad", "disposal"]).has(recordType)) return "Invalid record type.";
  if (!String(p.p_company ?? "").trim() || !limitedText(p.p_company, 120)) return "Invalid company.";
  if (!String(p.p_state ?? "").trim() || !limitedText(p.p_state, 40)) return "Invalid state.";
  if (!String(p.p_pad_name ?? "").trim() || !limitedText(p.p_pad_name, 160)) return "Invalid pad name.";
  if (!String(p.p_submitter_name ?? "").trim() || !limitedText(p.p_submitter_name, 120)) return "Invalid submitter name.";

  const limits: Array<[unknown, number]> = [
    [p.p_address, 500], [p.p_county, 120], [p.p_township, 120],
    [p.p_well_name, 6000], [p.p_api, 6000], [p.p_property_number, 6000],
    [p.p_structured_road_sequence, 6000], [p.p_written_directions, 12_000],
    [p.p_notes, 5000], [p.p_submitter_contact, 254], [p.p_source_page, 1000],
  ];
  if (limits.some(([value, max]) => !limitedText(value, max))) return "One or more fields are too long.";

  for (const [key, min, max] of [["p_latitude", -90, 90], ["p_longitude", -180, 180]] as const) {
    const value = p[key];
    if (value !== null && value !== undefined && value !== "") {
      const number = Number(value);
      if (!Number.isFinite(number) || number < min || number > max) return `Invalid ${key.slice(2)}.`;
    }
  }

  const wells = p.p_well_entries ?? [];
  if (!Array.isArray(wells) || wells.length > MAX_WELLS) return "Too many well entries.";
  for (const entry of wells) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return "Invalid well entry.";
    const row = entry as Record<string, unknown>;
    if (!limitedText(row.well_name, 300) || !limitedText(row.api, 200) || !limitedText(row.property_number, 200)) {
      return "A well entry is too long.";
    }
  }
  return null;
}

async function validateTurnstile(
  secret: string,
  token: string,
  remoteIp: string,
  idempotencyKey: string,
): Promise<TurnstileResult> {
  const form = new FormData();
  form.set("secret", secret);
  form.set("response", token);
  form.set("remoteip", remoteIp);
  form.set("idempotency_key", idempotencyKey);
  const result = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(10_000),
  });
  if (!result.ok) throw new Error(`Turnstile validation failed (${result.status})`);
  return await result.json() as TurnstileResult;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  const mode = modeForOrigin(origin);

  if (req.method === "OPTIONS") {
    if (mode === "blocked") return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (mode === "blocked") return response(origin || "null", 403, { success: false, error: "Origin not allowed." });

  const productionSiteKey = Deno.env.get("TURNSTILE_SITE_KEY") || "";
  const productionSecret = Deno.env.get("TURNSTILE_SECRET_KEY") || "";
  const useTestCredentials = mode === "preview" || mode === "local";
  const siteKey = useTestCredentials ? TEST_SITE_KEY : productionSiteKey;
  const turnstileSecret = useTestCredentials ? TEST_SECRET_KEY : productionSecret;

  if (req.method === "GET") {
    return response(origin, 200, {
      configured: Boolean(siteKey && turnstileSecret),
      siteKey: siteKey || null,
      action: TURNSTILE_ACTION,
      preview: useTestCredentials,
    });
  }
  if (req.method !== "POST") return response(origin, 405, { success: false, error: "Method not allowed." });
  if (!siteKey || !turnstileSecret) {
    return response(origin, 503, { success: false, error: "Public submissions are temporarily unavailable while the security challenge is configured." });
  }

  const contentLength = Number(req.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return response(origin, 413, { success: false, error: "Submission is too large." });
  }

  let bodyText = "";
  try {
    bodyText = await req.text();
  } catch {
    return response(origin, 400, { success: false, error: "Invalid request body." });
  }
  if (new TextEncoder().encode(bodyText).byteLength > MAX_BODY_BYTES) {
    return response(origin, 413, { success: false, error: "Submission is too large." });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(bodyText) as Record<string, unknown>;
  } catch {
    return response(origin, 400, { success: false, error: "Invalid request body." });
  }
  const payload = body.payload;
  const payloadError = validatePayload(payload);
  if (payloadError) return response(origin, 400, { success: false, error: payloadError });
  const submission = payload as Record<string, unknown>;

  // Keep the original honeypot behavior, but do not spend a CAPTCHA token or write a row.
  if (String(submission.p_website ?? "").trim()) {
    return response(origin, 202, { success: true, accepted: true });
  }

  const token = String(body.turnstile_token ?? "").trim();
  if (!token || token.length > 2048) return response(origin, 400, { success: false, error: "Complete the security check before submitting." });

  const requestId = crypto.randomUUID();
  const ip = clientIp(req);
  let turnstile: TurnstileResult;
  try {
    turnstile = await validateTurnstile(turnstileSecret, token, ip, requestId);
  } catch {
    return response(origin, 502, { success: false, error: "The security check could not be verified. Try again." });
  }
  if (!turnstile.success) {
    return response(origin, 400, { success: false, error: "The security check expired or was not accepted. Try again." });
  }
  if (!useTestCredentials) {
    if (turnstile.hostname && !PRODUCTION_HOSTNAMES.has(turnstile.hostname.toLowerCase())) {
      return response(origin, 403, { success: false, error: "Security check hostname mismatch." });
    }
    if (turnstile.action && turnstile.action !== TURNSTILE_ACTION) {
      return response(origin, 403, { success: false, error: "Security check action mismatch." });
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const secretKey = firstConfiguredKey(Deno.env.get("SUPABASE_SECRET_KEYS"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  if (!supabaseUrl || !secretKey) return response(origin, 503, { success: false, error: "Submission service is unavailable." });
  const rateSecret = Deno.env.get("SUBMISSION_RATE_LIMIT_SECRET") || secretKey;
  const [ipHash, identityHash] = await Promise.all([
    hmacHex(rateSecret, `ip:${ip}`),
    hmacHex(rateSecret, `identity:${normalizeIdentity(submission)}`),
  ]);

  const rpcResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/submit_pad_server`, {
    method: "POST",
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      p_payload: submission,
      p_ip_hash: ipHash,
      p_identity_hash: identityHash,
      p_request_id: requestId,
      p_captcha_hostname: turnstile.hostname || null,
      p_dry_run: useTestCredentials,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  const rpcText = await rpcResponse.text();
  if (!rpcResponse.ok) {
    let message = "The submission could not be sent.";
    try {
      const parsed = JSON.parse(rpcText) as { message?: string };
      const internal = parsed.message || "";
      if (internal.includes("submission_ip_limit") || internal.includes("submission_identity_limit") || internal.includes("submission_limit")) {
        return response(origin, 429, { success: false, error: "Too many submissions were sent recently. Try again later." });
      }
      if (internal.includes("duplicate_submission")) {
        return response(origin, 409, { success: false, error: "That pad is already waiting for review." });
      }
      if (internal.includes("invalid_") || internal.includes("too_many") || internal.includes("too_long")) {
        message = "One or more submission fields were not accepted.";
      }
    } catch {
      // Return the generic message below.
    }
    return response(origin, 400, { success: false, error: message });
  }

  let submissionId: unknown = requestId;
  try { submissionId = JSON.parse(rpcText); } catch { /* UUID text fallback */ }
  return response(origin, useTestCredentials ? 202 : 201, {
    success: true,
    accepted: true,
    preview: useTestCredentials,
    submission_id: submissionId,
  });
});
