import { buildReleasedGoogleHandoffPlan, type ReleasedGoogleHandoffPlan } from "./googleRoute";
import type { PadSummary } from "./types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://wvxzqtoiwhrgovzddtvz.supabase.co";
const publishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_5_sw9B-bcSdWgDzp4Z3pnQ_b-tutvtd";
const requestTimeoutMs = 3_000;

const releasedHandoffRequests = new Map<string, Promise<ReleasedGoogleHandoffPlan | null>>();

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function fetchReleasedGoogleHandoff(pad: PadSummary): Promise<ReleasedGoogleHandoffPlan | null> {
  if (!pad.canonicalId || typeof navigator !== "undefined" && navigator.onLine === false) return null;
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/brinesearch_v18_driver_google_handoff_release`, {
      method: "POST",
      headers: { apikey: publishableKey, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ p_pad_id: pad.canonicalId }),
      cache: "no-store",
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    if (!response.ok) return null;
    const payload = await response.json() as unknown;
    const row = Array.isArray(payload) ? object(payload[0]) : object(payload);
    if (!Object.keys(row).length) return null;
    const plan = buildReleasedGoogleHandoffPlan(row);
    return plan.padId === pad.canonicalId ? plan : null;
  } catch {
    return null;
  }
}

export function loadReleasedGoogleHandoff(pad: PadSummary) {
  if (!pad.canonicalId || typeof navigator !== "undefined" && navigator.onLine === false) return Promise.resolve(null);
  const existing = releasedHandoffRequests.get(pad.canonicalId);
  if (existing) return existing;
  const request = fetchReleasedGoogleHandoff(pad).finally(() => releasedHandoffRequests.delete(pad.canonicalId!));
  releasedHandoffRequests.set(pad.canonicalId, request);
  return request;
}

export function currentReleasedGoogleHandoff(
  plan: ReleasedGoogleHandoffPlan | null | undefined,
  pad: Pick<PadSummary, "canonicalId"> | null,
) {
  return plan && pad?.canonicalId === plan.padId ? plan : null;
}

export function releasedGoogleNavigationUrl(
  plan: ReleasedGoogleHandoffPlan | null,
  selectedRouteGroup: "primary" | "alternate" = "primary",
) {
  return selectedRouteGroup === "primary" ? plan?.singleUrl || null : null;
}
